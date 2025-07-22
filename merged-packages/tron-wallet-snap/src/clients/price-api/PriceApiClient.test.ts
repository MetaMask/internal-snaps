/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { CaipAssetType } from '@metamask/keyring-api';
import { cloneDeep } from 'lodash';

import { MOCK_EXCHANGE_RATES } from './mocks/exchange-rates';
import type { ICache } from '../../caching/ICache';
import { InMemoryCache } from '../../caching/InMemoryCache';
import { KnownCaip19Id } from '../../constants';
import { MOCK_HISTORICAL_PRICES } from './mocks/historical-prices';
import { PriceApiClient } from './PriceApiClient';
import type { SpotPrices, VsCurrencyParam } from './types';
import type { ConfigProvider } from '../../services/config';
import { mockLogger } from '../../utils/mockLogger';
import type { Serializable } from '../../utils/serialization/types';

describe('PriceApiClient', () => {
  let mockFetch: jest.Mock;
  let mockCache: ICache<Serializable>;
  let client: PriceApiClient;

  beforeEach(() => {
    mockFetch = jest.fn();

    const mockConfigProvider: ConfigProvider = {
      get: jest.fn().mockReturnValue({
        priceApi: {
          baseUrl: 'https://some-mock-url.com',
          chunkSize: 50,
          cacheTtlsMilliseconds: {
            fiatExchangeRates: 0,
            spotPrices: 0,
            historicalPrices: 0,
          },
        },
      }),
    } as unknown as ConfigProvider;

    mockCache = new InMemoryCache(mockLogger);

    client = new PriceApiClient(
      mockConfigProvider,
      mockCache,
      mockFetch,
      mockLogger,
    );
  });

  describe('getFiatExchangeRates', () => {
    it('fetches fiat exchange rates successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(MOCK_EXCHANGE_RATES),
      });

      const result = await client.getFiatExchangeRates();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://some-mock-url.com/v1/exchange-rates/fiat',
      );
      expect(result).toStrictEqual(MOCK_EXCHANGE_RATES);
    });
  });

  describe('getMultipleSpotPrices', () => {
    const mockResponse: SpotPrices = {
      [KnownCaip19Id.TrxMainnet]: {
        id: 'tron',
        price: 0.123456789,
        marketCap: 1234567890.123456789,
        allTimeHigh: 0.5,
        allTimeLow: 0.01,
        totalVolume: 123456789.123456789,
        high1d: 0.13,
        low1d: 0.12,
        circulatingSupply: 1000000000,
        dilutedMarketCap: 1234567890.123456789,
        marketCapPercentChange1d: 1.5,
        priceChange1d: 0.01,
        pricePercentChange1h: 0.5,
        pricePercentChange1d: 1.0,
        pricePercentChange7d: -2.0,
        pricePercentChange14d: 3.0,
        pricePercentChange30d: -1.0,
        pricePercentChange200d: 10.0,
        pricePercentChange1y: 20.0,
        bondingCurveProgressPercent: null,
        liquidity: null,
        totalSupply: null,
        holderCount: null,
        isMutable: null,
      },
      [KnownCaip19Id.UsdtMainnet]: {
        id: 'tether',
        price: 1.0,
        marketCap: 1000000000.0,
        allTimeHigh: 1.1,
        allTimeLow: 0.9,
        totalVolume: 50000000.0,
        high1d: 1.01,
        low1d: 0.99,
        circulatingSupply: 1000000000,
        dilutedMarketCap: 1000000000.0,
        marketCapPercentChange1d: 0.1,
        priceChange1d: 0.001,
        pricePercentChange1h: 0.01,
        pricePercentChange1d: 0.1,
        pricePercentChange7d: 0.0,
        pricePercentChange14d: 0.0,
        pricePercentChange30d: 0.0,
        pricePercentChange200d: 0.0,
        pricePercentChange1y: 0.0,
        bondingCurveProgressPercent: null,
        liquidity: null,
        totalSupply: null,
        holderCount: null,
        isMutable: null,
      },
    };

    describe('when the data is not cached', () => {
      it('fetches multiple spot prices successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValueOnce(mockResponse),
        });

        const result = await client.getMultipleSpotPrices([
          KnownCaip19Id.TrxMainnet,
          KnownCaip19Id.UsdtMainnet,
        ]);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://some-mock-url.com/v3/spot-prices?vsCurrency=usd&assetIds=tron%3A728126428%2Fslip44%3A195%2Ctron%3A728126428%2Ftrc20%3ATR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t&includeMarketData=true',
        );
        expect(result).toStrictEqual(mockResponse);
      });

      it('logs and throws an error if fetch fails', async () => {
        const mockError = new Error('Fetch failed');
        mockFetch.mockRejectedValueOnce(mockError);

        await expect(
          client.getMultipleSpotPrices([
            KnownCaip19Id.TrxLocalnet,
            KnownCaip19Id.UsdtMainnet,
          ]),
        ).rejects.toThrow('Fetch failed');
        expect(mockLogger.error).toHaveBeenCalledWith(
          mockError,
          'Error fetching spot prices',
        );
      });

      it('throws an error if response is not ok', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

        await expect(
          client.getMultipleSpotPrices([
            KnownCaip19Id.TrxLocalnet,
            KnownCaip19Id.UsdtMainnet,
          ]),
        ).rejects.toThrow('HTTP error! status: 404');
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.any(Error),
          'Error fetching spot prices',
        );
      });

      it('fetches spot price with custom vsCurrency', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValueOnce(mockResponse),
        });

        await client.getMultipleSpotPrices(
          [KnownCaip19Id.TrxMainnet, KnownCaip19Id.UsdtMainnet],
          'eur',
        );

        expect(mockFetch).toHaveBeenCalledWith(
          'https://some-mock-url.com/v3/spot-prices?vsCurrency=eur&assetIds=tron%3A728126428%2Fslip44%3A195%2Ctron%3A728126428%2Ftrc20%3ATR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t&includeMarketData=true',
        );
      });

      it('handles malformed JSON response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockRejectedValueOnce(new Error('Invalid JSON')),
        });

        await expect(
          client.getMultipleSpotPrices([
            KnownCaip19Id.TrxMainnet,
            KnownCaip19Id.UsdtMainnet,
          ]),
        ).rejects.toThrow('Invalid JSON');
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.any(Error),
          'Error fetching spot prices',
        );
      });

      it('handles network timeout', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

        await expect(
          client.getMultipleSpotPrices([
            KnownCaip19Id.TrxMainnet,
            KnownCaip19Id.UsdtMainnet,
          ]),
        ).rejects.toThrow('Network timeout');
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.any(Error),
          'Error fetching spot prices',
        );
      });

      it('throws when malformed response from the Price API', async () => {
        const mockMalformedResponse = cloneDeep(mockResponse);
        mockMalformedResponse[KnownCaip19Id.TrxMainnet]!.price = -999; // Price must be a positive number

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValueOnce(mockMalformedResponse),
        });

        await expect(
          client.getMultipleSpotPrices([KnownCaip19Id.TrxMainnet]),
        ).rejects.toThrow(
          'At path: tron:728126428/slip44:195.price -- Expected a number greater than or equal to 0 but received `-999`',
        );
      });
    });

    describe('when the data is fully cached', () => {
      it('returns the cached data', async () => {
        const cachedData = {
          'PriceApiClient:getMultipleSpotPrices:tron:728126428/slip44:195:usd':
            mockResponse[KnownCaip19Id.TrxMainnet]!,
          'PriceApiClient:getMultipleSpotPrices:tron:728126428/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t:usd':
            mockResponse[KnownCaip19Id.UsdtMainnet]!,
        };
        jest.spyOn(mockCache, 'mget').mockResolvedValueOnce(cachedData);
        jest.spyOn(mockCache, 'mset').mockResolvedValueOnce(undefined);

        const result = await client.getMultipleSpotPrices([
          KnownCaip19Id.TrxMainnet,
          KnownCaip19Id.UsdtMainnet,
        ]);

        expect(result).toStrictEqual(mockResponse);
        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockCache.mset).not.toHaveBeenCalled();
      });
    });

    describe('when the data is partially cached', () => {
      it('returns the cached data', async () => {
        // Only the first token is cached, we will need to fetch the second one
        const cachedData = {
          'PriceApiClient:getMultipleSpotPrices:tron:728126428/slip44:195:usd':
            mockResponse[KnownCaip19Id.TrxMainnet]!,
        };
        jest.spyOn(mockCache, 'mget').mockResolvedValueOnce(cachedData);
        jest.spyOn(mockCache, 'mset').mockResolvedValueOnce(undefined);
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValueOnce({
            [KnownCaip19Id.UsdtMainnet]:
              mockResponse[KnownCaip19Id.UsdtMainnet]!,
          }),
        });

        const result = await client.getMultipleSpotPrices([
          KnownCaip19Id.TrxMainnet,
          KnownCaip19Id.UsdtMainnet,
        ]);

        expect(result).toStrictEqual(mockResponse);

        // We should have fetched the second token only
        expect(mockFetch).toHaveBeenCalledWith(
          'https://some-mock-url.com/v3/spot-prices?vsCurrency=usd&assetIds=tron%3A728126428%2Ftrc20%3ATR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t&includeMarketData=true',
        );

        // The second token should be added to the cache
        expect(mockCache.mset).toHaveBeenCalledWith([
          {
            key: 'PriceApiClient:getMultipleSpotPrices:tron:728126428/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t:usd',
            value: mockResponse[KnownCaip19Id.UsdtMainnet]!,
            ttlMilliseconds: 0,
          },
        ]);
      });
    });
  });

  describe('security', () => {
    it('rejects invalid base URLs in constructor', () => {
      const invalidConfigProvider = {
        get: jest.fn().mockReturnValue({
          priceApi: {
            baseUrl: 'invalid-url',
            chunkSize: 50,
            cacheTtlsMilliseconds: {
              fiatExchangeRates: 0,
              spotPrices: 0,
              historicalPrices: 0,
            },
          },
        }),
      } as unknown as ConfigProvider;

      expect(
        () =>
          new PriceApiClient(
            invalidConfigProvider,
            mockCache,
            mockFetch,
            mockLogger,
          ),
      ).toThrow('Invalid URL format');
    });

    it('rejects tokenCaipAssetTypes that are invalid or that include malicious inputs', async () => {
      await expect(
        client.getMultipleSpotPrices([
          KnownCaip19Id.TrxLocalnet,
          'INVALID<script>alert(1)</script>' as CaipAssetType,
        ]),
      ).rejects.toThrow(
        'At path: 1 -- Expected a value of type `CaipAssetType`, but received: `"INVALID<script>alert(1)</script>"`',
      );
    });

    it('rejects vsCurrency parameters that are invalid or that include malicious inputs', async () => {
      await expect(
        client.getMultipleSpotPrices(
          [KnownCaip19Id.TrxLocalnet],
          'INVALID<script>alert(1)</script>' as VsCurrencyParam,
        ),
      ).rejects.toThrow(/Expected/u);
    });

    it('handles URLs with multiple query parameters safely', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({}),
      });

      await client.getMultipleSpotPrices([KnownCaip19Id.TrxLocalnet]);

      // Verify URL is properly constructed with encoded parameters
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /^https:\/\/some-mock-url\.com\/v3\/spot-prices\?([^&=]+=[^&]*&)*[^&=]+=.+$/u,
        ),
      );
    });

    it('rejects non-printable characters in input', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({}),
      });

      await expect(
        client.getMultipleSpotPrices(
          [KnownCaip19Id.TrxLocalnet],
          'usd\x00\x1F' as VsCurrencyParam,
        ),
      ).rejects.toThrow(/Expected/u);
    });
  });

  describe('getHistoricalPrices', () => {
    describe('when the data is not cached', () => {
      it('fetches historical prices successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValueOnce(MOCK_HISTORICAL_PRICES),
        });

        const cacheSetSpy = jest.spyOn(mockCache, 'set');

        const result = await client.getHistoricalPrices({
          assetType: KnownCaip19Id.TrxMainnet,
          timePeriod: '5d',
          from: 123,
          to: 456,
          vsCurrency: 'usd',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'https://some-mock-url.com/v3/historical-prices/tron:728126428/slip44:195?timePeriod=5d&from=123&to=456&vsCurrency=usd',
        );
        expect(cacheSetSpy).toHaveBeenCalledWith(
          'PriceApiClient:getHistoricalPrices:{"assetType":"tron:728126428/slip44:195","timePeriod":"5d","from":123,"to":456,"vsCurrency":"usd"}',
          MOCK_HISTORICAL_PRICES,
          0,
        );
        expect(result).toStrictEqual(MOCK_HISTORICAL_PRICES);
      });
    });

    describe('when the data is cached', () => {
      it('returns the cached data', async () => {
        jest
          .spyOn(mockCache, 'get')
          .mockResolvedValueOnce(MOCK_HISTORICAL_PRICES);

        const cacheGetSpy = jest.spyOn(mockCache, 'get');
        const cacheSetSpy = jest.spyOn(mockCache, 'set');

        const result = await client.getHistoricalPrices({
          assetType: KnownCaip19Id.TrxMainnet,
          timePeriod: '5d',
          from: 123,
          to: 456,
          vsCurrency: 'usd',
        });

        expect(cacheGetSpy).toHaveBeenCalled();
        expect(mockFetch).not.toHaveBeenCalled();
        expect(result).toStrictEqual(MOCK_HISTORICAL_PRICES);
        expect(cacheSetSpy).not.toHaveBeenCalled();
      });
    });
  });
});
