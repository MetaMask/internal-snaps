import type { FullScanRequest } from '@metamask/bitcoindevkit';
import { EsploraClient } from '@metamask/bitcoindevkit';
import { mock } from 'jest-mock-extended';

import type { BitcoinAccount, ChainConfig } from '../entities';
import {
  EsploraClientAdapter,
  FULL_SCAN_TIMEOUT_MS,
  SENDER_REQUEST_TIMEOUT_MS,
  SYNC_TIMEOUT_MS,
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

  describe('read retries', () => {
    const setupRetryTest = (): {
      adapter: EsploraClientAdapter;
      client: ReturnType<typeof mock<EsploraClient>>;
      account: BitcoinAccount;
    } => {
      const client = mock<EsploraClient>();
      jest.mocked(EsploraClient).mockImplementation(() => client);
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
      } as unknown as ChainConfig;
      const account = mock<BitcoinAccount>({ network: 'bitcoin' });
      account.startFullScan.mockReturnValue(mock<FullScanRequest>());
      return {
        adapter: new EsploraClientAdapter(config),
        client,
        account,
      };
    };

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('retries a scan that fails with a network error once', async () => {
      const { adapter, client, account } = setupRetryTest();
      const update = { update: true };
      client.full_scan
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue(update as never);

      const pending = adapter.fullScan(account);
      await jest.runAllTimersAsync();
      await pending;

      expect(client.full_scan).toHaveBeenCalledTimes(2);
      expect(account.applyUpdate).toHaveBeenCalledWith(update);
    });

    it('fails once the retry also fails with a network error', async () => {
      const { adapter, client, account } = setupRetryTest();
      client.full_scan.mockRejectedValue(new TypeError('Failed to fetch'));

      const pending = adapter
        .fullScan(account)
        .catch((error: unknown) => error);
      await jest.runAllTimersAsync();
      expect(await pending).toMatchObject({
        message: 'Failed to perform initial full scan',
      });

      // 1 attempt + 1 retry.
      expect(client.full_scan).toHaveBeenCalledTimes(2);
      expect(account.applyUpdate).not.toHaveBeenCalled();
    });

    it('never retries a broadcast', async () => {
      const { adapter, client } = setupRetryTest();
      client.broadcast.mockRejectedValue(new TypeError('Failed to fetch'));
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

      expect(client.broadcast).toHaveBeenCalledTimes(1);
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
});
