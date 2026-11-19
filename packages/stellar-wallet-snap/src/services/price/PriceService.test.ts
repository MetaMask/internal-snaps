import type { CaipAssetType } from '@metamask/utils';

import type { KnownCaip19AssetIdOrSlip44Id } from '../../api';
import { AppConfig } from '../../config';
import { logger } from '../../utils';
import { createMemoryCache } from '../../utils/__mocks__/cache.fixtures';
import * as errorsUtils from '../../utils/errors';
import type { SpotPrice } from './price-api/api';
import { PriceApiClient } from './price-api/PriceApiClient';
import { PriceService } from './PriceService';

const stellarClassicUsdc =
  'stellar:testnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as const satisfies KnownCaip19AssetIdOrSlip44Id;

const stellarTestnetMockAsset =
  'stellar:testnet/asset:MOCK-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as const satisfies KnownCaip19AssetIdOrSlip44Id;

const minimalSpot = (id: string, price: number): SpotPrice => ({
  id,
  price,
});

const SPOT_PRICES_CACHE_KEY_PREFIX = 'PriceService:getSpotPrices' as const;

const cacheKeySpotPrice = (assetId: CaipAssetType, vsCurrency: string) =>
  `${SPOT_PRICES_CACHE_KEY_PREFIX}:${assetId}:${vsCurrency}`;

describe('PriceService', () => {
  const setupTest = () => {
    const getSpotPricesSpy = vi.spyOn(
      PriceApiClient.prototype,
      'getSpotPrices',
    );
    getSpotPricesSpy.mockReset();
    getSpotPricesSpy.mockResolvedValue({ [stellarClassicUsdc]: null });

    const trackErrorSpy = vi
      .spyOn(errorsUtils, 'trackError')
      .mockResolvedValue(undefined);

    return {
      getSpotPricesSpy,
      trackErrorSpy,
    };
  };

  describe('getSpotPrices', () => {
    it('calls PriceApiClient and stores result in cache', async () => {
      const { getSpotPricesSpy } = setupTest();
      const { cache } = createMemoryCache();
      const service = new PriceService({ cache, logger });
      const spotResult = { [stellarClassicUsdc]: null };

      getSpotPricesSpy.mockResolvedValueOnce(spotResult);

      expect(
        await service.getSpotPrices({
          assetIds: [stellarClassicUsdc],
          vsCurrency: 'usd',
        }),
      ).toStrictEqual(spotResult);

      expect(getSpotPricesSpy).toHaveBeenCalledWith(
        [stellarClassicUsdc],
        'usd',
      );
      expect(cache.mset).toHaveBeenCalledWith([
        {
          key: cacheKeySpotPrice(stellarClassicUsdc, 'usd'),
          value: null,
          ttlMilliseconds: AppConfig.cache.ttlMilliseconds.spotPrices,
        },
      ]);
    });

    it('returns cached spot prices without calling PriceApiClient', async () => {
      const { getSpotPricesSpy } = setupTest();
      const { cache, store } = createMemoryCache();
      const service = new PriceService({ cache, logger });
      const cached = { [stellarClassicUsdc]: null };

      store.set(cacheKeySpotPrice(stellarClassicUsdc, 'eur'), null);

      expect(
        await service.getSpotPrices({
          assetIds: [stellarClassicUsdc],
          vsCurrency: 'eur',
        }),
      ).toStrictEqual(cached);

      expect(getSpotPricesSpy).not.toHaveBeenCalled();
    });

    it('calls PriceApiClient when refreshCache is true', async () => {
      const { getSpotPricesSpy } = setupTest();
      const { cache, store } = createMemoryCache();
      const service = new PriceService({ cache, logger });

      store.set(cacheKeySpotPrice(stellarClassicUsdc, 'usd'), null);

      await service.getSpotPrices(
        { assetIds: [stellarClassicUsdc], vsCurrency: 'usd' },
        true,
      );

      expect(getSpotPricesSpy).toHaveBeenCalledTimes(1);
    });

    it('returns empty object without calling PriceApiClient when assetIds is empty', async () => {
      const { getSpotPricesSpy } = setupTest();
      const { cache } = createMemoryCache();
      const service = new PriceService({ cache, logger });

      expect(await service.getSpotPrices({ assetIds: [] })).toStrictEqual({});

      expect(getSpotPricesSpy).not.toHaveBeenCalled();
      expect(cache.mget).toHaveBeenCalledWith([]);
      expect(cache.mset).not.toHaveBeenCalled();
    });

    it('deduplicates assetIds before calling PriceApiClient', async () => {
      const { getSpotPricesSpy } = setupTest();
      const { cache } = createMemoryCache();
      const service = new PriceService({ cache, logger });
      const spotResult = {
        [stellarClassicUsdc]: minimalSpot(stellarClassicUsdc, 1),
      };

      getSpotPricesSpy.mockResolvedValueOnce(spotResult);

      expect(
        await service.getSpotPrices({
          assetIds: [stellarClassicUsdc, stellarClassicUsdc],
          vsCurrency: 'usd',
        }),
      ).toStrictEqual(spotResult);

      expect(getSpotPricesSpy).toHaveBeenCalledTimes(1);
      expect(getSpotPricesSpy).toHaveBeenCalledWith(
        [stellarClassicUsdc],
        'usd',
      );
      expect(cache.mset).toHaveBeenCalledWith([
        {
          key: cacheKeySpotPrice(stellarClassicUsdc, 'usd'),
          value: spotResult[stellarClassicUsdc],
          ttlMilliseconds: AppConfig.cache.ttlMilliseconds.spotPrices,
        },
      ]);
    });

    it('uses default vsCurrency usd when vsCurrency is omitted', async () => {
      const { getSpotPricesSpy } = setupTest();
      const { cache } = createMemoryCache();
      const service = new PriceService({ cache, logger });
      const spotResult = { [stellarClassicUsdc]: null };

      getSpotPricesSpy.mockResolvedValueOnce(spotResult);

      await service.getSpotPrices({ assetIds: [stellarClassicUsdc] });

      expect(getSpotPricesSpy).toHaveBeenCalledWith(
        [stellarClassicUsdc],
        'usd',
      );
      expect(cache.mset).toHaveBeenCalledWith([
        {
          key: cacheKeySpotPrice(stellarClassicUsdc, 'usd'),
          value: null,
          ttlMilliseconds: AppConfig.cache.ttlMilliseconds.spotPrices,
        },
      ]);
    });

    it('fetches only assets missing from cache on partial hit', async () => {
      const { getSpotPricesSpy } = setupTest();
      const { cache, store } = createMemoryCache();
      const service = new PriceService({ cache, logger });
      const cachedPrice = minimalSpot(stellarClassicUsdc, 0.99);
      const mockPrice = minimalSpot(stellarTestnetMockAsset, 2);

      store.set(cacheKeySpotPrice(stellarClassicUsdc, 'usd'), cachedPrice);

      getSpotPricesSpy.mockResolvedValueOnce({
        [stellarTestnetMockAsset]: mockPrice,
      });

      expect(
        await service.getSpotPrices({
          assetIds: [stellarClassicUsdc, stellarTestnetMockAsset],
          vsCurrency: 'usd',
        }),
      ).toStrictEqual({
        [stellarClassicUsdc]: cachedPrice,
        [stellarTestnetMockAsset]: mockPrice,
      });

      expect(getSpotPricesSpy).toHaveBeenCalledTimes(1);
      expect(getSpotPricesSpy).toHaveBeenCalledWith(
        [stellarTestnetMockAsset],
        'usd',
      );
      expect(cache.mset).toHaveBeenCalledWith([
        {
          key: cacheKeySpotPrice(stellarTestnetMockAsset, 'usd'),
          value: mockPrice,
          ttlMilliseconds: AppConfig.cache.ttlMilliseconds.spotPrices,
        },
      ]);
    });

    it('returns all assets from cache when every asset is cached', async () => {
      const { getSpotPricesSpy } = setupTest();
      const { cache, store } = createMemoryCache();
      const service = new PriceService({ cache, logger });
      const usdcPrice = minimalSpot(stellarClassicUsdc, 1);
      const mockPrice = minimalSpot(stellarTestnetMockAsset, 3);

      store.set(cacheKeySpotPrice(stellarClassicUsdc, 'usd'), usdcPrice);
      store.set(cacheKeySpotPrice(stellarTestnetMockAsset, 'usd'), mockPrice);

      expect(
        await service.getSpotPrices({
          assetIds: [stellarClassicUsdc, stellarTestnetMockAsset],
          vsCurrency: 'usd',
        }),
      ).toStrictEqual({
        [stellarClassicUsdc]: usdcPrice,
        [stellarTestnetMockAsset]: mockPrice,
      });

      expect(getSpotPricesSpy).not.toHaveBeenCalled();
      expect(cache.mset).not.toHaveBeenCalled();
    });

    it('does not reuse cache across different vsCurrency values', async () => {
      const { getSpotPricesSpy } = setupTest();
      const { cache, store } = createMemoryCache();
      const service = new PriceService({ cache, logger });
      const usdPrice = minimalSpot(stellarClassicUsdc, 1);

      store.set(cacheKeySpotPrice(stellarClassicUsdc, 'usd'), usdPrice);
      getSpotPricesSpy.mockResolvedValueOnce({
        [stellarClassicUsdc]: minimalSpot(stellarClassicUsdc, 0.9),
      });

      expect(
        await service.getSpotPrices({
          assetIds: [stellarClassicUsdc],
          vsCurrency: 'eur',
        }),
      ).toStrictEqual({
        [stellarClassicUsdc]: minimalSpot(stellarClassicUsdc, 0.9),
      });

      expect(getSpotPricesSpy).toHaveBeenCalledTimes(1);
      expect(getSpotPricesSpy).toHaveBeenCalledWith(
        [stellarClassicUsdc],
        'eur',
      );
    });

    it('logs at error level and reports when reading the cache fails', async () => {
      const { getSpotPricesSpy, trackErrorSpy } = setupTest();
      const { cache } = createMemoryCache();
      const service = new PriceService({ cache, logger });
      const cacheError = new Error('cache read unavailable');
      const spotResult = { [stellarClassicUsdc]: null };

      vi.mocked(cache.mget).mockRejectedValueOnce(cacheError);
      getSpotPricesSpy.mockResolvedValueOnce(spotResult);

      expect(
        await service.getSpotPrices({
          assetIds: [stellarClassicUsdc],
          vsCurrency: 'usd',
        }),
      ).toStrictEqual(spotResult);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(' PriceService]'),
        'Error fetching cached spot prices',
        cacheError,
      );
      expect(trackErrorSpy).toHaveBeenCalledWith(cacheError);
      // A cache read failure must not stop the prices being fetched.
      expect(getSpotPricesSpy).toHaveBeenCalledWith(
        [stellarClassicUsdc],
        'usd',
      );
    });

    it('logs at error level and reports when writing the cache fails', async () => {
      const { getSpotPricesSpy, trackErrorSpy } = setupTest();
      const { cache } = createMemoryCache();
      const service = new PriceService({ cache, logger });
      const cacheError = new Error('cache write unavailable');
      const spotResult = { [stellarClassicUsdc]: null };

      vi.mocked(cache.mset).mockRejectedValueOnce(cacheError);
      getSpotPricesSpy.mockResolvedValueOnce(spotResult);

      expect(
        await service.getSpotPrices({
          assetIds: [stellarClassicUsdc],
          vsCurrency: 'usd',
        }),
      ).toStrictEqual(spotResult);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(' PriceService]'),
        'Error caching spot prices',
        cacheError,
      );
      expect(trackErrorSpy).toHaveBeenCalledWith(cacheError);
    });
  });
});
