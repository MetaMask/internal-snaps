import type { FullScanRequest } from '@metamask/bitcoindevkit';
import { EsploraClient } from '@metamask/bitcoindevkit';
import { mock } from 'jest-mock-extended';

import type { BitcoinAccount, ChainConfig } from '../entities';
import { EsploraClientAdapter } from './EsploraClientAdapter';

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
      expect(mockFetch).toHaveBeenCalledWith('https://bitcoin.example/tx/txid');
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

    it('throws and does not cache the failure for a non-2xx response', async () => {
      const { adapter } = setupTest();
      mockFetch.mockResolvedValue({ ok: false, status: 429 });

      await expect(
        adapter.getTransactionSenders('bitcoin', 'txid'),
      ).rejects.toThrow('Failed to fetch transaction');
      await expect(
        adapter.getTransactionSenders('bitcoin', 'txid'),
      ).rejects.toThrow('Failed to fetch transaction');
      expect(txCallCount()).toBe(2);
    });
  });
});
