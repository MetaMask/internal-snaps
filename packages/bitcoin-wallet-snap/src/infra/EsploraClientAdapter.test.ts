import type {
  FeeEstimates,
  FullScanRequest,
  Psbt as BdkPsbt,
  Update,
  Wallet as BdkWallet,
  seed_to_descriptor as BdkSeedToDescriptor,
} from '@metamask/bitcoindevkit';
import { EsploraClient } from '@metamask/bitcoindevkit';
import {
  FetchPolicyErrorName,
  Logger,
  LogLevel,
} from '@metamask/snap-networks-utils';
import { readFile } from 'fs/promises';
import { mock } from 'jest-mock-extended';
import { dirname, join } from 'path';

import type { BitcoinAccount, ChainConfig } from '../entities';
import { EsploraClientAdapter } from './EsploraClientAdapter';

jest.mock('@metamask/bitcoindevkit', () => ({
  EsploraClient: jest.fn(),
}));

const setupTest = (): {
  adapter: EsploraClientAdapter;
  mockEsploraClient: ReturnType<typeof mock<EsploraClient>>;
  account: ReturnType<typeof mock<BitcoinAccount>>;
  mockRequest: FullScanRequest;
} => {
  const mockEsploraClient = mock<EsploraClient>();
  jest.mocked(EsploraClient).mockReturnValue(mockEsploraClient);

  const config = mock<ChainConfig>({
    parallelRequests: 5,
    stopGap: { discovery: 5, scan: 20 },
    url: {
      bitcoin: 'https://bitcoin.example',
      testnet: 'https://testnet.example',
      testnet4: 'https://testnet4.example',
      signet: 'https://signet.example',
      regtest: 'https://regtest.example',
    },
  });

  const adapter = new EsploraClientAdapter(
    config,
    new Logger({ level: LogLevel.SILENT }),
  );
  const mockRequest = mock<FullScanRequest>();
  const account = mock<BitcoinAccount>({ network: 'bitcoin' });
  account.startFullScan.mockReturnValue(mockRequest);

  return {
    adapter,
    mockEsploraClient,
    account,
    mockRequest,
  };
};

describe('EsploraClientAdapter', () => {
  it('does not retry a non-error BDK rejection', async () => {
    const { adapter, mockEsploraClient, account } = setupTest();
    mockEsploraClient.full_scan.mockRejectedValue('failure');

    await expect(adapter.fullScan(account)).rejects.toThrow(
      'Failed to perform initial full scan',
    );
    expect(mockEsploraClient.full_scan).toHaveBeenCalledTimes(1);
  });

  it('disables the Esplora client internal retries', () => {
    setupTest();

    expect(EsploraClient).toHaveBeenCalledTimes(5);
    expect(EsploraClient).toHaveBeenCalledWith('https://bitcoin.example', 0);
  });

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

    it('retries transient failures with a fresh scan request and applies one update', async () => {
      const { adapter, mockEsploraClient, account, mockRequest } = setupTest();
      const retryRequest = mock<FullScanRequest>();
      const update = {};
      account.startFullScan
        .mockReturnValueOnce(mockRequest)
        .mockReturnValueOnce(retryRequest);
      mockEsploraClient.full_scan
        .mockRejectedValueOnce(new Error('Reqwest(error sending request)'))
        .mockResolvedValueOnce(update as never);

      await adapter.fullScan(account);

      expect(account.startFullScan).toHaveBeenCalledTimes(2);
      expect(mockEsploraClient.full_scan).toHaveBeenNthCalledWith(
        2,
        retryRequest,
        20,
        5,
      );
      expect(account.applyUpdate).toHaveBeenCalledTimes(1);
      expect(account.applyUpdate).toHaveBeenCalledWith(update);
    });

    it('retries BDK timeout errors', async () => {
      const { adapter, mockEsploraClient, account } = setupTest();
      mockEsploraClient.full_scan
        .mockRejectedValueOnce(
          Object.assign(new Error('The operation timed out'), {
            name: FetchPolicyErrorName.Timeout,
          }),
        )
        .mockResolvedValueOnce({} as never);

      await adapter.fullScan(account);

      expect(mockEsploraClient.full_scan).toHaveBeenCalledTimes(2);
    });

    it('does not retry a deterministic BDK error', async () => {
      const { adapter, mockEsploraClient, account } = setupTest();
      mockEsploraClient.full_scan.mockRejectedValue(
        new Error('Parsing(ParseIntError)'),
      );

      await expect(adapter.fullScan(account)).rejects.toThrow(
        'Failed to perform initial full scan',
      );
      expect(mockEsploraClient.full_scan).toHaveBeenCalledTimes(1);
    });

    it('does not retry a BDK response decode error', async () => {
      const { adapter, mockEsploraClient, account } = setupTest();
      mockEsploraClient.full_scan.mockRejectedValue(
        new Error(
          'Reqwest(reqwest::Error { kind: Decode, source: Error("invalid type") })',
        ),
      );

      await expect(adapter.fullScan(account)).rejects.toThrow(
        'Failed to perform initial full scan',
      );
      expect(mockEsploraClient.full_scan).toHaveBeenCalledTimes(1);
    });

    it('does not retry when constructing the scan request fails', async () => {
      const { adapter, mockEsploraClient, account } = setupTest();
      account.startFullScan.mockImplementation(() => {
        throw new Error('Invalid wallet state');
      });

      await expect(adapter.fullScan(account)).rejects.toThrow(
        'Failed to perform initial full scan',
      );
      expect(account.startFullScan).toHaveBeenCalledTimes(1);
      expect(mockEsploraClient.full_scan).not.toHaveBeenCalled();
    });

    it('does not retry a non-transient BDK HTTP response', async () => {
      const { adapter, mockEsploraClient, account } = setupTest();
      mockEsploraClient.full_scan.mockRejectedValue(
        new Error('HttpResponse { status: 404, message: "Not found" }'),
      );

      await expect(adapter.fullScan(account)).rejects.toThrow(
        'Failed to perform initial full scan',
      );
      expect(mockEsploraClient.full_scan).toHaveBeenCalledTimes(1);
    });

    it('retries a transient BDK HTTP response', async () => {
      const { adapter, mockEsploraClient, account } = setupTest();
      mockEsploraClient.full_scan
        .mockRejectedValueOnce(
          new Error(
            'HttpResponse { status: 503, message: "Service unavailable" }',
          ),
        )
        .mockResolvedValueOnce({} as never);

      await adapter.fullScan(account);

      expect(mockEsploraClient.full_scan).toHaveBeenCalledTimes(2);
    });
  });

  describe('sync', () => {
    it('retries transient failures and applies one update', async () => {
      const { adapter, mockEsploraClient, account } = setupTest();
      const update = {};
      mockEsploraClient.sync
        .mockRejectedValueOnce(new Error('Reqwest(error sending request)'))
        .mockResolvedValueOnce(update as never);

      await adapter.sync(account);

      expect(mockEsploraClient.sync).toHaveBeenCalledTimes(2);
      expect(account.applyUpdate).toHaveBeenCalledTimes(1);
      expect(account.applyUpdate).toHaveBeenCalledWith(update);
    });

    it('wraps sync failures in ExternalServiceError', async () => {
      const { adapter, mockEsploraClient, account } = setupTest();
      mockEsploraClient.sync.mockRejectedValue(
        new Error('HttpResponse { status: 400, message: "Bad request" }'),
      );

      await expect(adapter.sync(account)).rejects.toThrow(
        'Failed to synchronize account',
      );
      expect(mockEsploraClient.sync).toHaveBeenCalledTimes(1);
    });
  });

  describe('getFeeEstimates', () => {
    it('retries transient failures and returns the fee estimates', async () => {
      const { adapter, mockEsploraClient } = setupTest();
      const estimates = mock<FeeEstimates>();
      mockEsploraClient.get_fee_estimates
        .mockRejectedValueOnce(
          new Error(
            'HttpResponse { status: 503, message: "Service unavailable" }',
          ),
        )
        .mockResolvedValueOnce(estimates);

      expect(await adapter.getFeeEstimates('bitcoin')).toBe(estimates);
      expect(mockEsploraClient.get_fee_estimates).toHaveBeenCalledTimes(2);
    });

    it('wraps fee estimate failures in ExternalServiceError', async () => {
      const { adapter, mockEsploraClient } = setupTest();
      mockEsploraClient.get_fee_estimates.mockRejectedValue(
        new Error('HttpResponse { status: 400, message: "Bad request" }'),
      );

      await expect(adapter.getFeeEstimates('bitcoin')).rejects.toThrow(
        'Failed to fetch fee estimates',
      );
      expect(mockEsploraClient.get_fee_estimates).toHaveBeenCalledTimes(1);
    });
  });

  describe('broadcast', () => {
    it('retries transient failures with the same signed transaction', async () => {
      const { adapter, mockEsploraClient } = setupTest();
      const transaction = mock<Parameters<typeof adapter.broadcast>[1]>();
      mockEsploraClient.broadcast
        .mockRejectedValueOnce(new Error('Reqwest(error sending request)'))
        .mockResolvedValueOnce();

      await adapter.broadcast('bitcoin', transaction);

      expect(mockEsploraClient.broadcast).toHaveBeenCalledTimes(2);
      expect(mockEsploraClient.broadcast).toHaveBeenNthCalledWith(
        1,
        transaction,
      );
      expect(mockEsploraClient.broadcast).toHaveBeenNthCalledWith(
        2,
        transaction,
      );
    });

    it('treats an already-broadcast transaction as successful', async () => {
      const { adapter, mockEsploraClient } = setupTest();
      const transaction = mock<Parameters<typeof adapter.broadcast>[1]>();
      mockEsploraClient.broadcast
        .mockRejectedValueOnce(
          new Error(
            'HttpResponse { status: 503, message: "Service unavailable" }',
          ),
        )
        .mockRejectedValueOnce(
          new Error(
            'HttpResponse { status: 400, message: "sendrawtransaction RPC error: {\\"code\\":-27,\\"message\\":\\"Transaction already in block chain\\"}" }',
          ),
        );

      await adapter.broadcast('bitcoin', transaction);

      expect(mockEsploraClient.broadcast).toHaveBeenCalledTimes(2);
    });

    it('does not retry a non-transient broadcast rejection', async () => {
      const { adapter, mockEsploraClient } = setupTest();
      const transaction = mock<Parameters<typeof adapter.broadcast>[1]>();
      transaction.compute_txid.mockReturnValue({
        toString: () => 'txid',
      } as never);
      mockEsploraClient.broadcast.mockRejectedValue(
        new Error(
          'HttpResponse { status: 400, message: "sendrawtransaction RPC error: {\\"code\\":-26,\\"message\\":\\"min relay fee not met\\"}" }',
        ),
      );

      await expect(adapter.broadcast('bitcoin', transaction)).rejects.toThrow(
        'Failed to broadcast transaction',
      );
      expect(mockEsploraClient.broadcast).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTransactionSenders', () => {
    const mockFetch = jest.fn();

    beforeEach(() => {
      global.fetch = mockFetch;
    });

    afterEach(() => {
      mockFetch.mockReset();
    });

    const okResponse = (
      body: unknown,
    ): { ok: boolean; text: () => Promise<string> } => ({
      ok: true,
      text: async (): Promise<string> => JSON.stringify(body),
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
          signal: expect.any(AbortSignal),
        },
      );
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
        new Logger({ level: LogLevel.SILENT }),
      );
      mockFetch.mockResolvedValue(okResponse({ vin: [] }));

      await adapter.getTransactionSenders('bitcoin', 'txid');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://mempool.space/api/tx/txid',
        { signal: expect.any(AbortSignal) },
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

    it('does not retry a non-transient response and does not cache it', async () => {
      const { adapter } = setupTest();
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      await expect(
        adapter.getTransactionSenders('bitcoin', 'txid'),
      ).rejects.toThrow('HTTP error! status: 404');
      await expect(
        adapter.getTransactionSenders('bitcoin', 'txid'),
      ).rejects.toThrow('HTTP error! status: 404');
      expect(txCallCount()).toBe(2);
    });

    it('retries a transient response', async () => {
      const { adapter } = setupTest();
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          headers: { get: () => null },
        })
        .mockResolvedValueOnce(okResponse({ vin: [] }));

      expect(
        await adapter.getTransactionSenders('bitcoin', 'txid'),
      ).toStrictEqual([]);
      expect(txCallCount()).toBe(2);
    });
  });

  describe('with the real BDK WASM client', () => {
    const SAMPLE_PSBT =
      'cHNidP8BAI4CAAAAAAM1gwEAAAAAACJRIORP1Ndiq325lSC/jMG0RlhATHYmuuULfXgEHUM3u5i4AAAAAAAAAAAxai8AAUSx+i9Igg4HWdcpyagCs8mzuRCklgA7nRMkm69rAAAAAAAAAAAAAQACAAAAACp2AAAAAAAAFgAUgu3FEiFNy9ZR/zSpTo9nHREjrSoAAAAAAAAAAAA=';

    type RealBdkBindings = {
      /* eslint-disable @typescript-eslint/naming-convention */
      __wbg_set_wasm: (exports: WebAssembly.Exports) => void;
      EsploraClient: typeof EsploraClient;
      Psbt: typeof BdkPsbt;
      Wallet: typeof BdkWallet;
      seed_to_descriptor: typeof BdkSeedToDescriptor;
      /* eslint-enable @typescript-eslint/naming-convention */
    };

    const mockFetch = jest.fn();
    let realBdk: RealBdkBindings;

    beforeAll(async () => {
      const bdkDir = dirname(
        require.resolve('@metamask/bitcoindevkit/package.json'),
      );
      realBdk = jest.requireActual(join(bdkDir, 'bitcoindevkit_bg.js'));
      const wasmBytes = await readFile(join(bdkDir, 'bitcoindevkit_bg.wasm'));
      // eslint-disable-next-line no-restricted-globals
      const wasmModule = new WebAssembly.Module(wasmBytes);
      // eslint-disable-next-line no-restricted-globals
      const wasmInstance = new WebAssembly.Instance(wasmModule, {
        './bitcoindevkit_bg.js':
          realBdk as unknown as WebAssembly.ModuleImports,
      });
      realBdk.__wbg_set_wasm(wasmInstance.exports);
    });

    beforeEach(() => {
      global.fetch = mockFetch;
      jest
        .mocked(EsploraClient)
        .mockImplementation(
          (url: string, maxRetries: number) =>
            new realBdk.EsploraClient(url, maxRetries),
        );
    });

    afterEach(() => {
      mockFetch.mockReset();
    });

    const createRealAdapter = (): EsploraClientAdapter =>
      new EsploraClientAdapter(
        mock<ChainConfig>({
          parallelRequests: 1,
          stopGap: { discovery: 5, scan: 20 },
          url: {
            bitcoin: 'https://bitcoin.example',
            testnet: 'https://testnet.example',
            testnet4: 'https://testnet4.example',
            signet: 'https://signet.example',
            regtest: 'https://regtest.example',
          },
        }),
        new Logger({ level: LogLevel.SILENT }),
      );

    const wasmResponse = (
      status: number,
      body: string,
      url = 'https://bitcoin.example/tx',
    ): Response => {
      // eslint-disable-next-line no-restricted-globals
      const response = new Response(body, { status });
      Object.defineProperty(response, 'url', { value: url });
      return response;
    };

    it('retries real WASM Reqwest and 503 errors on getFeeEstimates, and does not retry decode or 400 errors', async () => {
      const adapter = createRealAdapter();
      mockFetch
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(
          wasmResponse(
            503,
            'Service Unavailable',
            'https://bitcoin.example/fee-estimates',
          ),
        )
        .mockResolvedValueOnce(
          wasmResponse(
            200,
            JSON.stringify({ '1': 12.5 }),
            'https://bitcoin.example/fee-estimates',
          ),
        );

      const estimates = await adapter.getFeeEstimates('bitcoin');

      expect(estimates.get(1)).toBe(12.5);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      mockFetch.mockReset();
      mockFetch.mockResolvedValue(
        wasmResponse(200, 'not-json', 'https://bitcoin.example/fee-estimates'),
      );

      await expect(adapter.getFeeEstimates('bitcoin')).rejects.toThrow(
        'Failed to fetch fee estimates',
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);

      mockFetch.mockReset();
      mockFetch.mockResolvedValue(
        wasmResponse(
          400,
          'Bad Request',
          'https://bitcoin.example/fee-estimates',
        ),
      );

      await expect(adapter.getFeeEstimates('bitcoin')).rejects.toThrow(
        'Failed to fetch fee estimates',
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries broadcast with the same real WASM Transaction and treats duplicate-tx responses as success', async () => {
      const adapter = createRealAdapter();
      const transaction = realBdk.Psbt.from_string(SAMPLE_PSBT).unsigned_tx;
      const expectedTxid = transaction.compute_txid().toString();
      const postedBodies: string[] = [];

      mockFetch.mockImplementation(async (input: Request) => {
        postedBodies.push(await input.text());
        if (postedBodies.length === 1) {
          return wasmResponse(503, 'Service Unavailable');
        }
        return wasmResponse(
          400,
          'sendrawtransaction RPC error: {"code":-27,"message":"Transaction already in block chain"}',
        );
      });

      await adapter.broadcast('bitcoin', transaction);

      expect(postedBodies).toHaveLength(2);
      expect(postedBodies[0]).toBe(postedBodies[1]);
      expect(transaction.compute_txid().toString()).toBe(expectedTxid);
    });

    it('recreates real WASM FullScanRequest and SyncRequest objects on retry without a null-pointer error', async () => {
      const adapter = createRealAdapter();
      const descriptors = realBdk.seed_to_descriptor(
        new Uint8Array(32).fill(1),
        'bitcoin',
        'p2wpkh',
      );
      const wallet = realBdk.Wallet.create(
        'bitcoin',
        descriptors.external,
        descriptors.internal,
      );
      let fullScanRequests = 0;
      let syncRequests = 0;
      let appliedUpdates = 0;
      const account = {
        id: 'account-1',
        network: 'bitcoin',
        startFullScan: () => {
          fullScanRequests += 1;
          return wallet.start_full_scan();
        },
        startSync: () => {
          syncRequests += 1;
          return wallet.start_sync_with_revealed_spks();
        },
        applyUpdate: (update: Update) => {
          appliedUpdates += 1;
          wallet.apply_update(update);
        },
      } as unknown as BitcoinAccount;

      const genesisBlock = JSON.stringify([
        {
          id: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
          height: 0,
          version: 1,
          timestamp: 1231006505,
          tx_count: 1,
          size: 285,
          weight: 1140,
          merkle_root:
            '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
          previousblockhash: null,
          mediantime: 1231006505,
          nonce: 2083236893,
          bits: 486604799,
          difficulty: 1,
        },
      ]);

      let callCount = 0;
      mockFetch.mockImplementation(async (input: Request) => {
        callCount += 1;
        if (callCount === 1) {
          return wasmResponse(503, 'Service Unavailable', input.url);
        }
        return wasmResponse(
          200,
          input.url.endsWith('/blocks') ? genesisBlock : '[]',
          input.url,
        );
      });

      await adapter.fullScan(account, 'discovery');
      expect(fullScanRequests).toBe(2);
      expect(appliedUpdates).toBe(1);

      callCount = 0;
      await adapter.sync(account);
      expect(syncRequests).toBe(2);
      expect(appliedUpdates).toBe(2);
    });
  });
});
