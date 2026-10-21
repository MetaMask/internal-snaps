import { Network } from '../../constants/solana';
import { mockLogger } from '../../services/__mocks__/logger';
import type { ConfigProvider } from '../../services/config';
import { SecurityAlertsApiClient } from './SecurityAlertsApiClient';

describe('SecurityAlertsApiClient', () => {
  const mockFetch = jest.fn();

  let client: SecurityAlertsApiClient;
  let mockConfigProvider: ConfigProvider;

  beforeEach(() => {
    mockConfigProvider = {
      config: {
        securityAlertsApi: {
          baseUrl: 'https://security-alerts-api-mock-url.com',
        },
      },
    } as ConfigProvider;

    client = new SecurityAlertsApiClient(
      mockConfigProvider,
      mockFetch,
      mockLogger,
    );

    mockFetch.mockClear();
  });

  describe('scanTransaction', () => {
    it('returns the scan result', async () => {
      const mockResponse = {
        result: 'some-result',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValueOnce(JSON.stringify(mockResponse)),
      });

      const scanResult = await client.scanTransactions({
        method: 'method',
        accountAddress: 'accountAddress',
        transactions: ['transaction'],
        scope: Network.Mainnet,
        options: ['simulation', 'validation'],
        origin: 'https://metamask.io',
      });

      expect(scanResult).toStrictEqual(mockResponse);
    });

    it('throws an error if the fetch fails', async () => {
      const mockError = new Error('Fetch failed');
      mockFetch.mockRejectedValue(mockError);

      await expect(
        client.scanTransactions({
          method: 'method',
          accountAddress: 'accountAddress',
          transactions: ['transaction'],
          scope: Network.Mainnet,
          options: ['simulation', 'validation'],
          origin: 'https://metamask.io',
        }),
      ).rejects.toThrow(mockError.message);
    });

    it('throws an error if the response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(
        client.scanTransactions({
          method: 'method',
          accountAddress: 'accountAddress',
          transactions: ['transaction'],
          scope: Network.Mainnet,
          options: ['simulation', 'validation'],
          origin: 'https://metamask.io',
        }),
      ).rejects.toThrow('HTTP error! status: 404');
    });
  });
});
