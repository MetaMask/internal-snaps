import { TokenApiClient } from './TokenApiClient';
import { KnownCaip19Id, Network, Networks } from '../../constants';
import type { TokenCaipAssetType } from '../../services/assets/types';
import type { ConfigProvider } from '../../services/config';
import { mockLogger } from '../../utils/mockLogger';

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

describe('TokenApiClient', () => {
  const mockFetch = jest.fn();

  let client: TokenApiClient;
  let mockConfigProvider: ConfigProvider;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigProvider = {
      get: jest.fn().mockReturnValue({
        tokenApi: {
          baseUrl: 'https://some-mock-url.com',
          chunkSize: 50,
        },
        staticApi: {
          baseUrl: 'https://some-mock-static-url.com',
        },
      }),
    } as unknown as ConfigProvider;

    client = new TokenApiClient(mockConfigProvider, mockFetch, mockLogger);
  });

  describe('constructor', () => {
    it('rejects invalid baseUrl', async () => {
      const invalidConfigProvider = {
        get: jest.fn().mockReturnValue({
          tokenApi: {
            baseUrl: 'invalid-url',
          },
        }),
      } as unknown as ConfigProvider;

      expect(
        () => new TokenApiClient(invalidConfigProvider, mockFetch, mockLogger),
      ).toThrow('Invalid URL format');
    });
  });

  describe('getTokensMetadata', () => {
    it('fetches and parses token metadata', async () => {
      const tokenAddresses = [
        `${Networks[Network.Mainnet].caip2Id}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` as TokenCaipAssetType,
        `${Networks[Network.Mainnet].caip2Id}/trc20:TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4` as TokenCaipAssetType,
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(MOCK_METADATA_RESPONSE),
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

    it('handles addresses in chunks when more than the limit is provided', async () => {
      const tokenAddresses = Array.from(
        { length: 60 },
        (_, i) =>
          `${Networks[Network.Nile].caip2Id}/trc20:address${i}` as TokenCaipAssetType,
      );

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(MOCK_METADATA_RESPONSE),
      });

      await client.getTokensMetadata(tokenAddresses);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('rejects caip19Ids that are invalid', async () => {
      await expect(
        client.getTokensMetadata(['invalid-caip19-id' as TokenCaipAssetType]),
      ).rejects.toThrow(
        'At path: 0 -- Expected a value of type `CaipAssetType`, but received: `"invalid-caip19-id"`',
      );
    });

    it('rejects caip19Ids that include malicious inputs', async () => {
      await expect(
        client.getTokensMetadata([
          KnownCaip19Id.UsdtMainnet,
          'INVALID<script>alert(1)</script>' as TokenCaipAssetType,
        ]),
      ).rejects.toThrow(
        'At path: 1 -- Expected a value of type `CaipAssetType`, but received: `"INVALID<script>alert(1)</script>"`',
      );
    });

    it('throws an error if fetch fails', async () => {
      const tokenAddresses = [
        `${Networks[Network.Nile].caip2Id}/trc20:address0` as TokenCaipAssetType,
        `${Networks[Network.Nile].caip2Id}/trc20:address1` as TokenCaipAssetType,
      ];

      const errorMessage = 'Error fetching token metadata';
      mockFetch.mockRejectedValueOnce(new Error(errorMessage));

      await expect(client.getTokensMetadata(tokenAddresses)).rejects.toThrow(
        errorMessage,
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        new Error(errorMessage),
        errorMessage,
      );
    });

    it('throws an error if the response includes an invalid assetId', async () => {
      const tokenAddresses = [
        `${Networks[Network.Nile].caip2Id}/trc20:address0` as TokenCaipAssetType,
        `${Networks[Network.Nile].caip2Id}/trc20:address1` as TokenCaipAssetType,
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([
          {
            decimals: 9,
            assetId: 'bad-asset-id',
            name: 'Popcat 1',
            symbol: 'POPCAT',
          },
        ]),
      });

      await expect(client.getTokensMetadata(tokenAddresses)).rejects.toThrow(
        'At path: 0.assetId -- Expected a string matching `/^tron:(728126428|3448148188|2494104990|localnet)\\/(trc10|trc20):[a-zA-Z0-9]+$/` but received "bad-asset-id"',
      );
    });

    it('returns default metadata if the asset type is not supported by the Token API', async () => {
      const supportedAssetType =
        `${Networks[Network.Localnet].caip2Id}/trc10:1GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr` as TokenCaipAssetType;
      const unsupportedAssetType =
        `${Networks[Network.Localnet].caip2Id}/trc10:address1` as TokenCaipAssetType;

      const tokenAddresses = [supportedAssetType, unsupportedAssetType];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([MOCK_METADATA_RESPONSE[0]]),
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
