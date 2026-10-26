import type { AddressInfo, FullScanRequest } from '@metamask/bitcoindevkit';
import { EsploraClient } from '@metamask/bitcoindevkit';
import { mock } from 'jest-mock-extended';

import type { BitcoinAccount, ChainConfig, Keychain } from '../entities';
import {
  EsploraClientAdapter,
  FULL_SCAN_TIMEOUT_MS,
  SENDER_REQUEST_TIMEOUT_MS,
  GAP_CHECK_REQUEST_TIMEOUT_MS,
  SYNC_TIMEOUT_MS,
  toScripthash,
  withOperationTimeout,
} from './EsploraClientAdapter';

jest.mock('@metamask/bitcoindevkit', () => ({
  EsploraClient: jest.fn(),
}));

const setupTest = (): {
  adapter: EsploraClientAdapter;
  mockEsploraClient: ReturnType<typeof mock<EsploraClient>>;
  account: BitcoinAccount;
  mockRequest: FullScanRequest;
} => {
  const mockEsploraClient = mock<EsploraClient>();
  jest.mocked(EsploraClient).mockReturnValue(mockEsploraClient);

  const config = mock<ChainConfig>({
    parallelRequests: 5,
    maxRetries: 3,
    stopGap: { discovery: 5, scan: 20 },
    url: {
      bitcoin: 'https://bitcoin.example',
      testnet: 'https://testnet.example',
      testnet4: 'https://testnet4.example',
      signet: 'https://signet.example',
      regtest: 'https://regtest.example',
    },
  });

  const adapter = new EsploraClientAdapter(config);
  const mockRequest = mock<FullScanRequest>();
  const account = mock<BitcoinAccount>({ network: 'bitcoin' });
  account.startFullScan.mockReturnValue(mockRequest);

  return { adapter, mockEsploraClient, account, mockRequest };
};

describe('EsploraClientAdapter', () => {
  describe('fullScan', () => {
    it('uses the scan stop gap by default', async () => {
      const { adapter, mockEsploraClient, account, mockRequest } = setupTest();

      await adapter.fullScan(account);

      expect(mockEsploraClient.full_scan).toHaveBeenCalledWith(
        mockRequest,
        20,
        5,
      );
    });

    it("uses the discovery stop gap in 'discovery' mode", async () => {
      const { adapter, mockEsploraClient, account, mockRequest } = setupTest();

      await adapter.fullScan(account, 'discovery');

      expect(mockEsploraClient.full_scan).toHaveBeenCalledWith(
        mockRequest,
        5,
        5,
      );
    });
  });

  describe('operation timeouts (v3: a stalled request must not keep the sync guard stuck)', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('withOperationTimeout resolves with the result and clears its timer', async () => {
      jest.useFakeTimers();

      expect(await withOperationTimeout(Promise.resolve(42), 1000, 'Op')).toBe(
        42,
      );
      expect(jest.getTimerCount()).toBe(0);
    });

    it('withOperationTimeout rejects with a TimeoutError when the operation stalls', async () => {
      jest.useFakeTimers();
      const stalled = new Promise<never>(() => undefined);

      const result = withOperationTimeout(stalled, 1000, 'Op');
      const caught = result.catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(1000);
      expect(await caught).toMatchObject({
        name: 'TimeoutError',
        message: 'Op timed out after 1000 ms',
      });
      expect(jest.getTimerCount()).toBe(0);
    });

    it('fails a sync whose request never settles after SYNC_TIMEOUT_MS, without applying anything', async () => {
      jest.useFakeTimers();
      const { adapter, mockEsploraClient, account } = setupTest();
      mockEsploraClient.sync.mockReturnValue(new Promise(() => undefined));

      const result = adapter.sync(account);
      const caught = result.catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS);
      expect(await caught).toMatchObject({
        message: 'Failed to synchronize account',
        cause: expect.objectContaining({ name: 'TimeoutError' }),
      });
      expect(account.applyUpdate).not.toHaveBeenCalled();
    });

    it('fails a full scan whose requests never settle after FULL_SCAN_TIMEOUT_MS', async () => {
      jest.useFakeTimers();
      const { adapter, mockEsploraClient, account } = setupTest();
      mockEsploraClient.full_scan.mockReturnValue(new Promise(() => undefined));

      const result = adapter.fullScan(account);
      let settled = false;
      result.catch(() => undefined).finally(() => (settled = true));
      await jest.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS);
      expect(settled).toBe(false);

      const caught = result.catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(
        FULL_SCAN_TIMEOUT_MS - SYNC_TIMEOUT_MS,
      );
      expect(await caught).toMatchObject({
        message: 'Failed to perform initial full scan',
        cause: expect.objectContaining({ name: 'TimeoutError' }),
      });
      expect(account.applyUpdate).not.toHaveBeenCalled();
    });
  });

  describe('fallback endpoint', () => {
    const setupFallbackTest = (
      fallbackUrl?: string,
    ): {
      adapter: EsploraClientAdapter;
      primary: ReturnType<typeof mock<EsploraClient>>;
      fallback: ReturnType<typeof mock<EsploraClient>>;
      account: BitcoinAccount;
    } => {
      const primary = mock<EsploraClient>();
      const fallback = mock<EsploraClient>();
      jest
        .mocked(EsploraClient)
        .mockImplementation((url: string) =>
          url === 'https://fallback.example' ? fallback : primary,
        );
      // A plain object: a deep mock would make every network's fallback
      // URL truthy.
      const config = {
        parallelRequests: 5,
        maxRetries: 3,
        stopGap: { discovery: 5, scan: 20 },
        url: {
          bitcoin: 'https://bitcoin.example',
          testnet: 'https://testnet.example',
          testnet4: 'https://testnet4.example',
          signet: 'https://signet.example',
          regtest: 'https://regtest.example',
        },
        ...(fallbackUrl ? { fallbackUrl: { bitcoin: fallbackUrl } } : {}),
      } as unknown as ChainConfig;
      const account = mock<BitcoinAccount>({ network: 'bitcoin' });
      account.startFullScan.mockReturnValue(mock<FullScanRequest>());
      return {
        adapter: new EsploraClientAdapter(config),
        primary,
        fallback,
        account,
      };
    };

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('scans against the fallback endpoint when the primary keeps failing with a network error', async () => {
      const { adapter, primary, fallback, account } = setupFallbackTest(
        'https://fallback.example',
      );
      primary.full_scan.mockRejectedValue(new TypeError('Failed to fetch'));
      const update = { update: true };
      fallback.full_scan.mockResolvedValue(update as never);

      const pending = adapter.fullScan(account);
      await jest.runAllTimersAsync();
      await pending;

      // 1 attempt + 1 retry on the primary, then the fallback.
      expect(primary.full_scan).toHaveBeenCalledTimes(2);
      expect(fallback.full_scan).toHaveBeenCalledTimes(1);
      expect(account.applyUpdate).toHaveBeenCalledWith(update);
    });

    it('fails with the primary error when no fallback is configured', async () => {
      const { adapter, primary, fallback, account } = setupFallbackTest();
      primary.full_scan.mockRejectedValue(new TypeError('Failed to fetch'));

      const pending = adapter
        .fullScan(account)
        .catch((error: unknown) => error);
      await jest.runAllTimersAsync();
      expect(await pending).toMatchObject({
        message: 'Failed to perform initial full scan',
      });

      expect(fallback.full_scan).not.toHaveBeenCalled();
    });

    it('never retries nor falls back a broadcast', async () => {
      const { adapter, primary, fallback } = setupFallbackTest(
        'https://fallback.example',
      );
      primary.broadcast.mockRejectedValue(new TypeError('Failed to fetch'));
      const transaction =
        mock<Parameters<EsploraClientAdapter['broadcast']>[1]>();
      transaction.compute_txid.mockReturnValue({
        toString: () => 'txid',
      } as never);

      const pending = adapter
        .broadcast('bitcoin', transaction)
        .catch((error: unknown) => error);
      await jest.runAllTimersAsync();
      expect(await pending).toMatchObject({
        message: 'Failed to broadcast transaction',
      });

      expect(primary.broadcast).toHaveBeenCalledTimes(1);
      expect(fallback.broadcast).not.toHaveBeenCalled();
    });
  });

  describe('getTransactionSenders', () => {
    const mockFetch = jest.fn();
    let abortController: AbortController;

    beforeEach(() => {
      global.fetch = mockFetch;
      abortController = new AbortController();
      // Drive the abort path deterministically instead of leaving a real
      // 10-second timer pending on each call.
      jest
        .spyOn(AbortSignal, 'timeout')
        .mockReturnValue(abortController.signal);
    });

    afterEach(() => {
      mockFetch.mockReset();
    });

    const okResponse = (
      body: unknown,
    ): { ok: boolean; json: () => Promise<unknown> } => ({
      ok: true,
      json: async (): Promise<unknown> => body,
    });

    const txCallCount = (): number =>
      mockFetch.mock.calls.filter(([url]) => String(url).includes('/tx/'))
        .length;

    it('returns the deduped prevout addresses of every input', async () => {
      const { adapter } = setupTest();
      mockFetch.mockResolvedValue(
        okResponse({
          vin: [
            { prevout: { scriptpubkey_address: 'bc1qsender1' } },
            { prevout: { scriptpubkey_address: 'bc1qsender2' } },
            { prevout: { scriptpubkey_address: 'bc1qsender1' } },
          ],
        }),
      );

      const senders = await adapter.getTransactionSenders('bitcoin', 'txid');

      expect(senders).toStrictEqual(['bc1qsender1', 'bc1qsender2']);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://bitcoin.example/tx/txid',
        {
          signal: abortController.signal,
        },
      );
      expect(AbortSignal.timeout).toHaveBeenCalledWith(
        SENDER_REQUEST_TIMEOUT_MS,
      );
    });

    it('retries a timed-out request under the fetch policy, then rejects and evicts the cache', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
      try {
        const { adapter } = setupTest();
        // The signal is already aborted, so every attempt times out.
        abortController.abort();
        mockFetch.mockImplementation(
          async (_url: unknown, init?: { signal?: AbortSignal }) => {
            if (init?.signal?.aborted) {
              throw new Error('TimeoutError');
            }
            return okResponse({ vin: [] });
          },
        );

        const first = adapter
          .getTransactionSenders('bitcoin', 'txid')
          .catch((error: unknown) => error);
        await jest.runAllTimersAsync();
        expect(await first).toMatchObject({
          message: 'Failed to fetch transaction',
        });
        // 1 attempt + 3 policy retries.
        const attempts = txCallCount();
        expect(attempts).toBe(4);

        // The failure is not cached, so the next lookup fetches again.
        const second = adapter
          .getTransactionSenders('bitcoin', 'txid')
          .catch((error: unknown) => error);
        await jest.runAllTimersAsync();
        expect(await second).toMatchObject({
          message: 'Failed to fetch transaction',
        });
        expect(txCallCount()).toBeGreaterThan(attempts);
      } finally {
        jest.useRealTimers();
      }
    });

    it('skips inputs without a resolved prevout (e.g. coinbase)', async () => {
      const { adapter } = setupTest();
      mockFetch.mockResolvedValue(
        okResponse({
          vin: [
            { prevout: null },
            { prevout: { scriptpubkey_address: 'bc1qsender' } },
            {},
          ],
        }),
      );

      const senders = await adapter.getTransactionSenders('bitcoin', 'txid');

      expect(senders).toStrictEqual(['bc1qsender']);
    });

    it('strips a mempool.space /v1 suffix from the configured url', async () => {
      const mockEsploraClient = mock<EsploraClient>();
      jest.mocked(EsploraClient).mockReturnValue(mockEsploraClient);
      const adapter = new EsploraClientAdapter(
        mock<ChainConfig>({
          url: {
            bitcoin: 'https://mempool.space/api/v1',
            testnet: 'https://testnet.example',
            testnet4: 'https://testnet4.example',
            signet: 'https://signet.example',
            regtest: 'https://regtest.example',
          },
        }),
      );
      mockFetch.mockResolvedValue(okResponse({ vin: [] }));

      await adapter.getTransactionSenders('bitcoin', 'txid');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://mempool.space/api/tx/txid',
        { signal: abortController.signal },
      );
    });

    it('caches results per network and txid', async () => {
      const { adapter } = setupTest();
      mockFetch.mockResolvedValue(
        okResponse({ vin: [{ prevout: { scriptpubkey_address: 'bc1q' } }] }),
      );

      await adapter.getTransactionSenders('bitcoin', 'txid');
      await adapter.getTransactionSenders('bitcoin', 'txid');

      expect(txCallCount()).toBe(1);
    });

    it('throws without retrying and does not cache the failure for a non-retryable non-2xx response', async () => {
      const { adapter } = setupTest();
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      await expect(
        adapter.getTransactionSenders('bitcoin', 'txid'),
      ).rejects.toThrow('Failed to fetch transaction');
      await expect(
        adapter.getTransactionSenders('bitcoin', 'txid'),
      ).rejects.toThrow('Failed to fetch transaction');
      expect(txCallCount()).toBe(2);
    });

    it('retries a transient non-2xx response and returns the recovered result', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
      try {
        const { adapter } = setupTest();
        mockFetch
          .mockResolvedValueOnce({ ok: false, status: 503 })
          .mockResolvedValueOnce(
            okResponse({
              vin: [{ prevout: { scriptpubkey_address: 'bc1qsender1' } }],
            }),
          );

        const pending = adapter.getTransactionSenders('bitcoin', 'txid');
        await jest.runAllTimersAsync();

        expect(await pending).toStrictEqual(['bc1qsender1']);
        expect(txCallCount()).toBe(2);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('extendDiscoveryScan (v5: complete a discovery-gap scan without refetching it)', () => {
    const mockFetch = jest.fn();
    let abortController: AbortController;

    beforeEach(() => {
      global.fetch = mockFetch;
      abortController = new AbortController();
      jest
        .spyOn(AbortSignal, 'timeout')
        .mockReturnValue(abortController.signal);
    });

    afterEach(() => {
      mockFetch.mockReset();
    });

    const okResponse = (
      body: unknown,
    ): { ok: boolean; json: () => Promise<unknown> } => ({
      ok: true,
      json: async (): Promise<unknown> => body,
    });

    // Script bytes encode the keychain and index, so each address has a
    // distinct script hash that the tests can map back.
    const scriptBytes = (keychain: Keychain, index: number): Uint8Array =>
      new Uint8Array([keychain === 'external' ? 0 : 1, index]);

    const setupAccount = (
      account: BitcoinAccount,
      indexes: Record<Keychain, { used?: number; revealed?: number }>,
    ): void => {
      jest
        .mocked(account.lastUsedIndex)
        .mockImplementation((keychain) => indexes[keychain].used);
      jest
        .mocked(account.lastRevealedIndex)
        .mockImplementation((keychain) => indexes[keychain].revealed);
      jest.mocked(account.peekKeychainAddress).mockImplementation(
        (keychain, index) =>
          ({
            address: {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              script_pubkey: { as_bytes: () => scriptBytes(keychain, index) },
            },
          }) as unknown as AddressInfo,
      );
    };

    const checkedIndexes = (account: BitcoinAccount): [Keychain, number][] =>
      jest
        .mocked(account.peekKeychainAddress)
        .mock.calls.map(([keychain, index]) => [keychain, index]);

    const range = (
      keychain: Keychain,
      first: number,
      last: number,
    ): [Keychain, number][] =>
      Array.from({ length: last - first + 1 }, (_unused, offset) => [
        keychain,
        first + offset,
      ]);

    it('computes the Esplora script hash (reversed SHA-256)', async () => {
      expect(await toScripthash(new Uint8Array())).toBe(
        '55b852781b9995a44c939b64e441ae2724b96f99c8f4fb9a141cfc9842c4b0e3',
      );
    });

    it('checks only the addresses the standard gap adds and skips the full scan when they are unused (run B-v4 account 0)', async () => {
      const { adapter, mockEsploraClient, account } = setupTest();
      // Account 0 of run B-v4: activity at index 0 of both keychains (the
      // receive keychain has one more revealed address). The discovery scan
      // fetched up to index 5 of each keychain (last active + 5).
      setupAccount(account, {
        external: { used: 0, revealed: 1 },
        internal: { used: 0, revealed: 0 },
      });
      mockFetch.mockResolvedValue(okResponse([]));

      await adapter.extendDiscoveryScan(account);

      expect(checkedIndexes(account)).toStrictEqual([
        ...range('external', 6, 21),
        ...range('internal', 6, 20),
      ]);
      expect(mockFetch).toHaveBeenCalledTimes(31);
      // The standard-gap full scan refetched both keychains from index 0
      // (50 requests in run B-v4).
      expect(mockEsploraClient.full_scan).not.toHaveBeenCalled();
      const hash = await toScripthash(scriptBytes('external', 6));
      expect(mockFetch).toHaveBeenCalledWith(
        `https://bitcoin.example/scripthash/${hash}/txs`,
        { signal: abortController.signal },
      );
      expect(AbortSignal.timeout).toHaveBeenCalledWith(
        GAP_CHECK_REQUEST_TIMEOUT_MS,
      );
      expect(account.applyUpdate).not.toHaveBeenCalled();
    });

    it('covers indexes discovery..scan-1 of a keychain without activity', async () => {
      const { adapter, account } = setupTest();
      setupAccount(account, {
        external: { used: 3 },
        internal: {},
      });
      mockFetch.mockResolvedValue(okResponse([]));

      await adapter.extendDiscoveryScan(account);

      expect(checkedIndexes(account)).toStrictEqual([
        ...range('external', 9, 23),
        ...range('internal', 5, 19),
      ]);
    });

    it('runs the standard-gap full scan as soon as a checked address has history', async () => {
      const { adapter, mockEsploraClient, account, mockRequest } = setupTest();
      setupAccount(account, {
        external: { used: 0, revealed: 0 },
        internal: { used: 0, revealed: 0 },
      });
      const usedHash = await toScripthash(scriptBytes('external', 8));
      mockFetch.mockImplementation(async (url: string) =>
        okResponse(url.includes(usedHash) ? [{ txid: 'tx' }] : []),
      );

      await adapter.extendDiscoveryScan(account);

      // Batches of `parallelRequests`: 6..10 holds the used index 8, so the
      // following batches are not requested.
      expect(mockFetch).toHaveBeenCalledTimes(5);
      expect(mockEsploraClient.full_scan).toHaveBeenCalledTimes(1);
      expect(mockEsploraClient.full_scan).toHaveBeenCalledWith(
        mockRequest,
        20,
        5,
      );
    });

    it('falls back to the standard-gap full scan when the check fails', async () => {
      const { adapter, mockEsploraClient, account } = setupTest();
      setupAccount(account, {
        external: { used: 0 },
        internal: {},
      });
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      await adapter.extendDiscoveryScan(account);

      expect(mockEsploraClient.full_scan).toHaveBeenCalledTimes(1);
    });

    it('falls back to the standard-gap full scan when the addresses cannot be derived', async () => {
      const { adapter, mockEsploraClient, account } = setupTest();
      jest.mocked(account.lastUsedIndex).mockImplementation(() => {
        throw new Error('unsupported');
      });

      await adapter.extendDiscoveryScan(account);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockEsploraClient.full_scan).toHaveBeenCalledTimes(1);
    });

    it('treats an unexpected response body as history', async () => {
      const { adapter, mockEsploraClient, account } = setupTest();
      setupAccount(account, {
        external: { used: 0 },
        internal: {},
      });
      mockFetch.mockResolvedValue(okResponse({ error: 'unexpected' }));

      await adapter.extendDiscoveryScan(account);

      expect(mockEsploraClient.full_scan).toHaveBeenCalledTimes(1);
    });

    it('propagates a failure of the fallback full scan', async () => {
      const { adapter, mockEsploraClient, account } = setupTest();
      setupAccount(account, {
        external: { used: 0 },
        internal: {},
      });
      mockFetch.mockResolvedValue(okResponse([{ txid: 'tx' }]));
      mockEsploraClient.full_scan.mockRejectedValue(new Error('boom'));

      await expect(adapter.extendDiscoveryScan(account)).rejects.toThrow(
        'Failed to perform initial full scan',
      );
    });
  });
});
