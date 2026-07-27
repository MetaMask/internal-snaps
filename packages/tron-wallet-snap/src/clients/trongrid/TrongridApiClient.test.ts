import { TrongridApiClient } from './TrongridApiClient';
import type { Trc20Balance, TransactionInfo } from './types';
import type { ICache } from '../../caching/ICache';
import { InMemoryCache } from '../../caching/InMemoryCache';
import { Network } from '../../constants';
import { ConfigProvider } from '../../services/config';
import nativeTransferWithoutTimestampMock from '../../services/transactions/mocks/trongrid/account-transactions/native-transfer-without-timestamp.json';
import nativeTransferMock from '../../services/transactions/mocks/trongrid/account-transactions/native-transfer.json';
import { mockLogger } from '../../utils/mockLogger';
import type { Serializable } from '../../utils/serialization/types';
import { TronHttpClient } from '../tron-http/TronHttpClient';

type WithTrongridApiClientCallback<ReturnValue> = (payload: {
  client: TrongridApiClient;
  configProvider: ConfigProvider;
  tronHttpClient: TronHttpClient;
  cache: ICache<Serializable>;
}) => Promise<ReturnValue> | ReturnValue;

type WithTrongridApiClientOptions = {
  options: {
    trongridBaseUrls?: Record<string, string>;
    tronHttpBaseUrls?: Record<string, string>;
  };
};

/**
 * Wraps tests for TrongridApiClient by creating a fresh client with all
 * dependencies and restoring `global.fetch` afterward.
 *
 * @param args - Either a callback, or an options bag + callback. Options allow
 * overriding base URLs. The callback receives the client and its dependencies.
 * @returns The return value of the callback.
 */
async function withTrongridApiClient<ReturnValue>(
  ...args:
    | [WithTrongridApiClientCallback<ReturnValue>]
    | [WithTrongridApiClientOptions, WithTrongridApiClientCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ options = {} }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];

  const defaultBaseUrls = {
    [Network.Mainnet]: 'https://api.trongrid.io',
    [Network.Nile]: 'https://nile.trongrid.io',
    [Network.Shasta]: 'https://api.shasta.trongrid.io',
  };

  const configProvider = new ConfigProvider();
  const baseConfig = configProvider.get();
  jest.spyOn(configProvider, 'get').mockReturnValue({
    ...baseConfig,
    trongridApi: {
      baseUrls: options.trongridBaseUrls ?? defaultBaseUrls,
    },
    tronHttpApi: {
      baseUrls: options.tronHttpBaseUrls ?? defaultBaseUrls,
    },
  });

  const tronHttpClient = new TronHttpClient({ configProvider });
  const cache = new InMemoryCache(mockLogger);
  const client = new TrongridApiClient({
    configProvider,
    tronHttpClient,
    cache,
  });

  // eslint-disable-next-line no-restricted-globals
  const originalFetch = global.fetch;
  try {
    return await testFunction({
      client,
      configProvider,
      tronHttpClient,
      cache,
    });
  } finally {
    // eslint-disable-next-line no-restricted-globals
    global.fetch = originalFetch;
  }
}

describe('TrongridApiClient', () => {
  describe('getTrc20BalancesByAddress', () => {
    const mockAddress = 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx';
    const normalizeBalances = (balances: Trc20Balance[]): Trc20Balance[] =>
      balances.map((balance) => ({ ...balance }));

    it('fetches and returns TRC20 balances for an address', async () => {
      await withTrongridApiClient(async ({ client }) => {
        const mockTrc20Balances: Trc20Balance[] = [
          { TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: '24249143' },
          { TGPuQ7g7H8GsUEXhwvvJop4zCncurEh2ht: '88123456' },
        ];

        // eslint-disable-next-line no-restricted-globals
        jest.spyOn(global, 'fetch').mockResolvedValueOnce(
          // eslint-disable-next-line no-restricted-globals
          new Response(
            JSON.stringify({
              data: mockTrc20Balances,
              success: true,
              // eslint-disable-next-line @typescript-eslint/naming-convention
              meta: { at: 1770121997373, page_size: 4 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

        const result = await client.getTrc20BalancesByAddress(
          Network.Mainnet,
          mockAddress,
        );

        expect(normalizeBalances(result)).toStrictEqual(mockTrc20Balances);
        // eslint-disable-next-line no-restricted-globals
        expect(global.fetch).toHaveBeenCalledWith(
          `https://api.trongrid.io/v1/accounts/${mockAddress}/trc20/balance`,
          expect.objectContaining({
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
            }),
          }),
        );
      });
    });

    it('returns empty array when no TRC20 tokens are found', async () => {
      await withTrongridApiClient(async ({ client }) => {
        // eslint-disable-next-line no-restricted-globals
        jest.spyOn(global, 'fetch').mockResolvedValueOnce(
          // eslint-disable-next-line no-restricted-globals
          new Response(
            JSON.stringify({
              data: [],
              success: true,
              // eslint-disable-next-line @typescript-eslint/naming-convention
              meta: { at: 1770121997373, page_size: 0 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

        const result = await client.getTrc20BalancesByAddress(
          Network.Mainnet,
          mockAddress,
        );

        expect(result).toStrictEqual([]);
      });
    });

    it('returns empty array when data is undefined', async () => {
      await withTrongridApiClient(async ({ client }) => {
        // eslint-disable-next-line no-restricted-globals
        jest.spyOn(global, 'fetch').mockResolvedValueOnce(
          // eslint-disable-next-line no-restricted-globals
          new Response(
            JSON.stringify({
              success: true,
              // eslint-disable-next-line @typescript-eslint/naming-convention
              meta: { at: 1770121997373, page_size: 0 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

        const result = await client.getTrc20BalancesByAddress(
          Network.Mainnet,
          mockAddress,
        );

        expect(result).toStrictEqual([]);
      });
    });

    it('throws error when network base URL is invalid', async () => {
      const invalidBaseUrls = {
        [Network.Mainnet]: 'https://api.trongrid.io',
        [Network.Nile]: '',
        [Network.Shasta]: '',
      };

      await withTrongridApiClient(
        {
          options: {
            trongridBaseUrls: invalidBaseUrls,
            tronHttpBaseUrls: invalidBaseUrls,
          },
        },
        async ({ client }) => {
          await expect(
            client.getTrc20BalancesByAddress(Network.Nile, mockAddress),
          ).rejects.toThrow('Invalid URL format');
        },
      );
    });

    it('throws error when HTTP request fails', async () => {
      await withTrongridApiClient(async ({ client }) => {
        // eslint-disable-next-line no-restricted-globals
        jest.spyOn(global, 'fetch').mockResolvedValueOnce(
          // eslint-disable-next-line no-restricted-globals
          new Response('', { status: 500 }),
        );

        await expect(
          client.getTrc20BalancesByAddress(Network.Mainnet, mockAddress),
        ).rejects.toThrow('HTTP error! status: 500');
      });
    });

    it('throws error when API returns success: false', async () => {
      await withTrongridApiClient(async ({ client }) => {
        // eslint-disable-next-line no-restricted-globals
        jest.spyOn(global, 'fetch').mockResolvedValueOnce(
          // eslint-disable-next-line no-restricted-globals
          new Response(
            JSON.stringify({
              data: [],
              success: false,
              // eslint-disable-next-line @typescript-eslint/naming-convention
              meta: { at: 1770121997373, page_size: 0 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

        await expect(
          client.getTrc20BalancesByAddress(Network.Mainnet, mockAddress),
        ).rejects.toThrow('API request failed');
      });
    });

    it('works with different networks', async () => {
      await withTrongridApiClient(async ({ client }) => {
        const mockTrc20Balances: Trc20Balance[] = [
          { TTestToken123: '1000000' },
        ];

        // eslint-disable-next-line no-restricted-globals
        jest.spyOn(global, 'fetch').mockResolvedValueOnce(
          // eslint-disable-next-line no-restricted-globals
          new Response(
            JSON.stringify({
              data: mockTrc20Balances,
              success: true,
              // eslint-disable-next-line @typescript-eslint/naming-convention
              meta: { at: 1770121997373, page_size: 1 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

        const result = await client.getTrc20BalancesByAddress(
          Network.Nile,
          mockAddress,
        );

        expect(normalizeBalances(result)).toStrictEqual(mockTrc20Balances);
        // eslint-disable-next-line no-restricted-globals
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('nile.trongrid.io'),
          expect.any(Object),
        );
      });
    });

    it('validates TRC20 balance data structure', async () => {
      await withTrongridApiClient(async ({ client }) => {
        const validBalances: Trc20Balance[] = [
          { TokenAddress1: '100' },
          { TokenAddress2: '200' },
        ];

        // eslint-disable-next-line no-restricted-globals
        jest.spyOn(global, 'fetch').mockResolvedValueOnce(
          // eslint-disable-next-line no-restricted-globals
          new Response(
            JSON.stringify({
              data: validBalances,
              success: true,
              // eslint-disable-next-line @typescript-eslint/naming-convention
              meta: { at: 1770121997373, page_size: 2 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

        const result = await client.getTrc20BalancesByAddress(
          Network.Mainnet,
          mockAddress,
        );

        expect(result).toHaveLength(2);
        const normalizedBalances = normalizeBalances(result);
        expect(normalizedBalances[0]).toStrictEqual({ TokenAddress1: '100' });
        expect(normalizedBalances[1]).toStrictEqual({ TokenAddress2: '200' });
      });
    });
  });

  describe('getTransactionInfoByAddress', () => {
    const mockAddress = 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx';
    const mockTx = nativeTransferMock as TransactionInfo;

    it('fetches transactions without a limit query parameter by default', async () => {
      await withTrongridApiClient(async ({ client }) => {
        // eslint-disable-next-line no-restricted-globals
        jest.spyOn(global, 'fetch').mockResolvedValueOnce(
          // eslint-disable-next-line no-restricted-globals
          new Response(
            JSON.stringify({
              data: [mockTx],
              success: true,
              // eslint-disable-next-line @typescript-eslint/naming-convention
              meta: { at: 1770121997373, page_size: 1 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

        const result = await client.getTransactionInfoByAddress(
          Network.Mainnet,
          mockAddress,
        );

        expect(result).toHaveLength(1);
        // eslint-disable-next-line no-restricted-globals
        expect(global.fetch).toHaveBeenCalledWith(
          `https://api.trongrid.io/v1/accounts/${mockAddress}/transactions`,
          expect.any(Object),
        );
      });
    });

    it('appends limit to the query string when options.limit is set', async () => {
      await withTrongridApiClient(async ({ client }) => {
        // eslint-disable-next-line no-restricted-globals
        jest.spyOn(global, 'fetch').mockResolvedValueOnce(
          // eslint-disable-next-line no-restricted-globals
          new Response(
            JSON.stringify({
              data: [mockTx],
              success: true,
              // eslint-disable-next-line @typescript-eslint/naming-convention
              meta: { at: 1770121997373, page_size: 1 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

        await client.getTransactionInfoByAddress(Network.Mainnet, mockAddress, {
          limit: 1,
        });

        // eslint-disable-next-line no-restricted-globals
        expect(global.fetch).toHaveBeenCalledWith(
          `https://api.trongrid.io/v1/accounts/${mockAddress}/transactions?limit=1`,
          expect.any(Object),
        );
      });
    });

    it('accepts legacy internal_transactions entries with optional fields omitted', async () => {
      await withTrongridApiClient(async ({ client }) => {
        // Example seen live on tx aaff541203021b7398bfd29e0eeb28417eab93e113f2bf504d2169d1b8161500,
        // where a legacy internal_transactions entry omitted data.call_value.
        const transactionWithSparseInternalTransaction = {
          ...mockTx,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          internal_transactions: [
            {
              data: {
                note: '63616c6c',
              },
            },
          ],
        };

        // eslint-disable-next-line no-restricted-globals
        jest.spyOn(global, 'fetch').mockResolvedValueOnce(
          // eslint-disable-next-line no-restricted-globals
          new Response(
            JSON.stringify({
              data: [transactionWithSparseInternalTransaction],
              success: true,
              // eslint-disable-next-line @typescript-eslint/naming-convention
              meta: { at: 1770121997373, page_size: 1 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

        const result = await client.getTransactionInfoByAddress(
          Network.Mainnet,
          mockAddress,
        );

        expect(result).toHaveLength(1);
      });
    });

    it('accepts raw transactions when raw_data.timestamp is omitted', async () => {
      await withTrongridApiClient(async ({ client }) => {
        // Example seen live on tx c4e8c4a45830e882e92062ede0ecd09702c51e4732385b9cf33590d470b08357,
        // where Trongrid omitted raw_data.timestamp entirely.
        // eslint-disable-next-line no-restricted-globals
        jest.spyOn(global, 'fetch').mockResolvedValueOnce(
          // eslint-disable-next-line no-restricted-globals
          new Response(
            JSON.stringify({
              data: [nativeTransferWithoutTimestampMock],
              success: true,
              // eslint-disable-next-line @typescript-eslint/naming-convention
              meta: { at: 1770121997373, page_size: 1 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

        const result = await client.getTransactionInfoByAddress(
          Network.Mainnet,
          mockAddress,
        );

        expect(result).toHaveLength(1);
      });
    });
  });

  describe('getChainParameters', () => {
    it('returns fresh parameters when persisted cache operations fail', async () => {
      await withTrongridApiClient(async ({ client, tronHttpClient, cache }) => {
        const chainParameters = [{ key: 'getTransactionFee', value: 1000 }];
        jest
          .spyOn(cache, 'get')
          .mockRejectedValueOnce(new Error('Cache read failed'));
        jest
          .spyOn(cache, 'set')
          .mockRejectedValueOnce(new Error('Cache write failed'));
        jest
          .spyOn(tronHttpClient, 'getChainParameters')
          .mockResolvedValueOnce(chainParameters);
        jest
          .spyOn(tronHttpClient, 'getNextMaintenanceTime')
          .mockResolvedValueOnce(Date.now() + 3_600_000);

        expect(await client.getChainParameters(Network.Mainnet)).toStrictEqual(
          chainParameters,
        );
      });
    });

    it('reuses the cache across client recreation and isolates networks', async () => {
      await withTrongridApiClient(
        async ({ client, configProvider, tronHttpClient, cache }) => {
          const mainnetParameters = [{ key: 'getTransactionFee', value: 1000 }];
          const nileParameters = [{ key: 'getTransactionFee', value: 2000 }];
          const getChainParameters = jest
            .spyOn(tronHttpClient, 'getChainParameters')
            .mockResolvedValueOnce(mainnetParameters)
            .mockResolvedValueOnce(nileParameters);
          jest
            .spyOn(tronHttpClient, 'getNextMaintenanceTime')
            .mockResolvedValue(Date.now() + 3_600_000);

          expect(
            await client.getChainParameters(Network.Mainnet),
          ).toStrictEqual(mainnetParameters);

          const recreatedClient = new TrongridApiClient({
            configProvider,
            tronHttpClient,
            cache,
          });

          expect(
            await recreatedClient.getChainParameters(Network.Mainnet),
          ).toStrictEqual(mainnetParameters);
          expect(
            await recreatedClient.getChainParameters(Network.Nile),
          ).toStrictEqual(nileParameters);
          expect(getChainParameters).toHaveBeenCalledTimes(2);
          expect(getChainParameters).toHaveBeenNthCalledWith(
            1,
            Network.Mainnet,
          );
          expect(getChainParameters).toHaveBeenNthCalledWith(2, Network.Nile);
        },
      );
    });

    it('refreshes a recreated client after the maintenance window', async () => {
      await withTrongridApiClient(
        async ({ client, configProvider, tronHttpClient, cache }) => {
          const now = 1_700_000_000_000;
          const maintenanceTime = now + 3_600_000;
          const dateNow = jest.spyOn(Date, 'now').mockReturnValue(now);
          const getChainParameters = jest
            .spyOn(tronHttpClient, 'getChainParameters')
            .mockResolvedValueOnce([{ key: 'getTransactionFee', value: 1000 }])
            .mockResolvedValueOnce([{ key: 'getTransactionFee', value: 2000 }]);
          jest
            .spyOn(tronHttpClient, 'getNextMaintenanceTime')
            .mockResolvedValueOnce(maintenanceTime)
            .mockResolvedValueOnce(maintenanceTime + 3_600_000);

          await client.getChainParameters(Network.Mainnet);
          dateNow.mockReturnValue(maintenanceTime + 1);

          const recreatedClient = new TrongridApiClient({
            configProvider,
            tronHttpClient,
            cache,
          });

          expect(
            await recreatedClient.getChainParameters(Network.Mainnet),
          ).toStrictEqual([{ key: 'getTransactionFee', value: 2000 }]);
          expect(getChainParameters).toHaveBeenCalledTimes(2);
          dateNow.mockRestore();
        },
      );
    });
  });

  describe('peekCachedChainParameters', () => {
    it('returns undefined when no chain parameters are cached for the scope', async () => {
      await withTrongridApiClient(async ({ client }) => {
        const peeked = await client.peekCachedChainParameters(Network.Mainnet);

        expect(peeked).toBeUndefined();
      });
    });

    it('returns the last-known cached chain parameters populated by getChainParameters', async () => {
      const chainParameters = [
        { key: 'getTransactionFee', value: 1000 },
        { key: 'getEnergyFee', value: 100 },
      ];

      await withTrongridApiClient(async ({ client }) => {
        // getChainParameters issues two fetches: chain parameters first, then
        // next-maintenance-time (the cache TTL).
        // eslint-disable-next-line no-restricted-globals
        jest.spyOn(global, 'fetch').mockResolvedValueOnce(
          // eslint-disable-next-line no-restricted-globals
          new Response(JSON.stringify({ chainParameter: chainParameters }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
        // eslint-disable-next-line no-restricted-globals
        jest.spyOn(global, 'fetch').mockResolvedValueOnce(
          // eslint-disable-next-line no-restricted-globals
          new Response(
            JSON.stringify({
              // eslint-disable-next-line id-denylist
              num: Date.now() + 3_600_000,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );

        // Populate the cache and capture exactly what was cached.
        const live = await client.getChainParameters(Network.Mainnet);
        const peeked = await client.peekCachedChainParameters(Network.Mainnet);

        // Peek must return exactly what the live call cached (same reference and
        // shape), without triggering another fetch.
        expect(peeked).toStrictEqual(live);
        expect(peeked).toHaveLength(chainParameters.length);
        expect(peeked?.[0]?.key).toBe('getTransactionFee');
        expect(peeked?.[0]?.value).toBe(1000);
        expect(peeked?.[1]?.key).toBe('getEnergyFee');
        expect(peeked?.[1]?.value).toBe(100);
      });
    });
  });
});
