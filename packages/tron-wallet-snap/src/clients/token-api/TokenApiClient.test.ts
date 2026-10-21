import type { Logger } from '@metamask/snap-networks-utils';

import { KnownCaip19Id, Network, Networks } from '../../constants';
import type { TokenCaipAssetType } from '../../services/assets/types';
import type { ConfigProvider } from '../../services/config';
import { mockLogger } from '../../utils/mockLogger';
import { TokenApiClient } from './TokenApiClient';

const MOCK_METADATA_RESPONSE = [
  {
    decimals: 6,
    assetId: 'tron:728126428/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    name: 'Tether USD',
    symbol: 'USDT',
  },
  {
    decimals: 18,
    assetId: 'tron:728126428/trc20:TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4',
    name: 'TrueUSD',
    symbol: 'TUSD',
  },
];

type TokenApiClientSetup = {
  client: TokenApiClient;
  mockConfigProvider: ConfigProvider;
  mockFetch: jest.Mock;
  logger: Logger;
};

/**
 * Creates a Token API client and executes a test with its isolated dependencies.
 *
 * @param testFn - The test body receiving the client, config provider, and fetch mock.
 * @returns Whatever the test function returns.
 */
async function withTokenApiClient(
  testFn: (setup: TokenApiClientSetup) => void | Promise<void>,
): Promise<void> {
  jest.clearAllMocks();
  const mockFetch = jest.fn();
  const logger = mockLogger as unknown as Logger;

  const mockConfigProvider: ConfigProvider = {
    config: {
      tokenApi: {
        baseUrl: 'https://some-mock-url.com',
        chunkSize: 50,
      },
      staticApi: {
        baseUrl: 'https://some-mock-static-url.com',
      },
    },
  } as ConfigProvider;

  const client = new TokenApiClient(mockConfigProvider, mockFetch, logger);

  await testFn({ client, mockConfigProvider, mockFetch, logger });
}

describe('TokenApiClient', () => {
  describe('constructor', () => {
    it('rejects invalid baseUrl', async () => {
      await withTokenApiClient(async ({ mockFetch, logger }) => {
        const invalidConfigProvider = {
          config: {
            tokenApi: {
              baseUrl: 'invalid-url',
            },
          },
        } as ConfigProvider;

        expect(
          () => new TokenApiClient(invalidConfigProvider, mockFetch, logger),
        ).toThrow('Invalid URL format');
      });
    });
  });

  describe('getTokensMetadata', () => {
    it('fetches and parses token metadata', async () => {
      await withTokenApiClient(async ({ client, mockFetch }) => {
        const tokenAddresses = [
          `${
            Networks[Network.Mainnet].caip2Id
          }/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` as TokenCaipAssetType,
          `${
            Networks[Network.Mainnet].caip2Id
          }/trc20:TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4` as TokenCaipAssetType,
        ];
        mockFetch.mockResolvedValueOnce({
          ok: true,
          text: jest
            .fn()
            .mockResolvedValueOnce(JSON.stringify(MOCK_METADATA_RESPONSE)),
        });

        const metadata = await client.getTokensMetadata(tokenAddresses);

        expect(metadata).toStrictEqual({
          [`tron:728126428/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`]: {
            iconUrl:
              'https://some-mock-static-url.com/api/v2/tokenIcons/assets/tron/728126428/trc20/TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t.png',
            name: 'Tether USD',
            symbol: 'USDT',
            fungible: true,
            units: [
              {
                decimals: 6,
                name: 'Tether USD',
                symbol: 'USDT',
              },
            ],
          },
          [`tron:728126428/trc20:TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4`]: {
            iconUrl:
              'https://some-mock-static-url.com/api/v2/tokenIcons/assets/tron/728126428/trc20/TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4.png',
            name: 'TrueUSD',
            symbol: 'TUSD',
            fungible: true,
            units: [
              {
                decimals: 18,
                name: 'TrueUSD',
                symbol: 'TUSD',
              },
            ],
          },
        });
      });
    });

    it('handles addresses in chunks when more than the limit is provided', async () => {
      await withTokenApiClient(async ({ client, mockFetch }) => {
        const tokenAddresses = Array.from(
          { length: 60 },
          (_, i) =>
            `${
              Networks[Network.Nile].caip2Id
            }/trc20:address${i}` as TokenCaipAssetType,
        );

        mockFetch.mockResolvedValue({
          ok: true,
          text: jest
            .fn()
            .mockResolvedValue(JSON.stringify(MOCK_METADATA_RESPONSE)),
        });

        await client.getTokensMetadata(tokenAddresses);

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(
          mockFetch.mock.calls.map(([url]) =>
            new URL(url as string).searchParams.get('assetIds')?.split(','),
          ),
        ).toStrictEqual([
          tokenAddresses.slice(0, 50),
          tokenAddresses.slice(50),
        ]);
      });
    });

    it('merges metadata returned from consecutive chunks', async () => {
      await withTokenApiClient(async ({ mockFetch, logger }) => {
        const thirdTokenAddress = `${
          Networks[Network.Mainnet].caip2Id
        }/trc20:THirdTokenAddressForChunkingTest` as TokenCaipAssetType;
        const tokenAddresses = [
          `${
            Networks[Network.Mainnet].caip2Id
          }/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` as TokenCaipAssetType,
          `${
            Networks[Network.Mainnet].caip2Id
          }/trc20:TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4` as TokenCaipAssetType,
          thirdTokenAddress,
        ];
        const chunkedConfigProvider = {
          config: {
            tokenApi: { baseUrl: 'https://some-mock-url.com', chunkSize: 2 },
            staticApi: { baseUrl: 'https://some-mock-static-url.com' },
          },
        } as ConfigProvider;
        const client = new TokenApiClient(
          chunkedConfigProvider,
          mockFetch,
          logger,
        );
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            text: jest
              .fn()
              .mockResolvedValueOnce(JSON.stringify(MOCK_METADATA_RESPONSE)),
          })
          .mockResolvedValueOnce({
            ok: true,
            text: jest.fn().mockResolvedValueOnce(
              JSON.stringify([
                {
                  decimals: 6,
                  assetId: thirdTokenAddress,
                  name: 'Third token',
                  symbol: 'THIRD',
                },
              ]),
            ),
          });

        const metadata = await client.getTokensMetadata(tokenAddresses);

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(Object.keys(metadata)).toStrictEqual(tokenAddresses);
        expect(metadata[thirdTokenAddress]?.name).toBe('Third token');
      });
    });

    it('rejects caip19Ids that are invalid', async () => {
      await withTokenApiClient(async ({ client }) => {
        await expect(
          client.getTokensMetadata(['invalid-caip19-id' as TokenCaipAssetType]),
        ).rejects.toThrow(
          'At path: 0 -- Expected a value of type `CaipAssetType`, but received: `"invalid-caip19-id"`',
        );
      });
    });

    it('rejects caip19Ids that include malicious inputs', async () => {
      await withTokenApiClient(async ({ client }) => {
        await expect(
          client.getTokensMetadata([
            KnownCaip19Id.UsdtMainnet,
            'INVALID<script>alert(1)</script>' as TokenCaipAssetType,
          ]),
        ).rejects.toThrow(
          'At path: 1 -- Expected a value of type `CaipAssetType`, but received: `"INVALID<script>alert(1)</script>"`',
        );
      });
    });

    it('throws an error if fetch fails', async () => {
      await withTokenApiClient(async ({ client, mockFetch, logger }) => {
        const tokenAddresses = [
          `${
            Networks[Network.Nile].caip2Id
          }/trc20:address0` as TokenCaipAssetType,
          `${
            Networks[Network.Nile].caip2Id
          }/trc20:address1` as TokenCaipAssetType,
        ];

        const errorMessage = 'Error fetching token metadata';
        mockFetch.mockRejectedValue(new Error(errorMessage));

        await expect(client.getTokensMetadata(tokenAddresses)).rejects.toThrow(
          errorMessage,
        );
        expect(mockFetch).toHaveBeenCalledTimes(4);
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ message: errorMessage }),
          errorMessage,
        );
      });
    });

    it('retries transient HTTP errors and does not retry 404 responses', async () => {
      await withTokenApiClient(async ({ client, mockFetch }) => {
        const tokenAddresses = [
          `${
            Networks[Network.Mainnet].caip2Id
          }/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` as TokenCaipAssetType,
        ];
        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            status: 503,
            headers: { get: () => null },
          })
          .mockResolvedValueOnce({
            ok: true,
            text: jest
              .fn()
              .mockResolvedValueOnce(
                JSON.stringify([MOCK_METADATA_RESPONSE[0]]),
              ),
          });

        const metadata = await client.getTokensMetadata(tokenAddresses);

        const firstTokenAddress = tokenAddresses[0] as TokenCaipAssetType;
        expect(metadata[firstTokenAddress]).toBeDefined();
        expect(mockFetch).toHaveBeenCalledTimes(2);

        mockFetch.mockClear();
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          headers: { get: () => null },
        });

        await expect(client.getTokensMetadata(tokenAddresses)).rejects.toThrow(
          'HTTP error! status: 404',
        );
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });

    it('throws an error if the response includes an invalid assetId', async () => {
      await withTokenApiClient(async ({ client, mockFetch }) => {
        const tokenAddresses = [
          `${
            Networks[Network.Nile].caip2Id
          }/trc20:address0` as TokenCaipAssetType,
          `${
            Networks[Network.Nile].caip2Id
          }/trc20:address1` as TokenCaipAssetType,
        ];

        mockFetch.mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValueOnce(
            JSON.stringify([
              {
                decimals: 9,
                assetId: 'bad-asset-id',
                name: 'Popcat 1',
                symbol: 'POPCAT',
              },
            ]),
          ),
        });

        await expect(client.getTokensMetadata(tokenAddresses)).rejects.toThrow(
          'At path: 0.assetId -- Expected a value of type `CaipAssetType`, but received: `"bad-asset-id"`',
        );
      });
    });

    it('returns default metadata if the asset type is not supported by the Token API', async () => {
      await withTokenApiClient(async ({ client, mockFetch }) => {
        const supportedAssetType = `${
          Networks[Network.Mainnet].caip2Id
        }/trc10:1GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr` as TokenCaipAssetType;
        const unsupportedAssetType = `${
          Networks[Network.Mainnet].caip2Id
        }/trc10:address1` as TokenCaipAssetType;

        const tokenAddresses = [supportedAssetType, unsupportedAssetType];
        mockFetch.mockResolvedValueOnce({
          ok: true,
          text: jest
            .fn()
            .mockResolvedValueOnce(JSON.stringify([MOCK_METADATA_RESPONSE[0]])),
        });

        const metadata = await client.getTokensMetadata(tokenAddresses);

        expect(metadata[supportedAssetType]).toBeDefined();
        expect(metadata[unsupportedAssetType]).toStrictEqual({
          name: 'UNKNOWN',
          symbol: 'UNKNOWN',
          fungible: true,
          iconUrl: '',
          units: [{ name: 'UNKNOWN', symbol: 'UNKNOWN', decimals: 9 }],
        });
      });
    });
  });
});
