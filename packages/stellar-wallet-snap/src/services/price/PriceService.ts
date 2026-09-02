import type { Logger, Serializable } from '@metamask/snap-networks-utils';
import type { CaipAssetType } from '@metamask/utils';

import { AppConfig } from '../../config';
import { trackError } from '../../utils';
import type { ICache } from '../cache';
import type {
  SpotPrice,
  SpotPricesResponse,
  VsCurrencyParam,
} from './price-api/api';
import { PriceApiClient } from './price-api/PriceApiClient';

/**
 * Fetches and caches spot price data from the MetaMask Price API.
 */
export class PriceService {
  readonly #priceApiClient: PriceApiClient;

  readonly #logger: Logger;

  readonly #cache: ICache<Serializable>;

  constructor({
    cache,
    logger,
  }: {
    cache: ICache<Serializable>;
    logger: Logger;
  }) {
    this.#priceApiClient = new PriceApiClient({
      baseUrl: AppConfig.api.priceApi.baseUrl,
    });
    this.#cache = cache;
    this.#logger = logger.withPrefix('[🪙 PriceService]');
  }

  /**
   * Gets spot prices for the given CAIP asset IDs from the Price API.
   * Results are cached for `AppConfig.cache.ttlMilliseconds.spotPrices`.
   *
   * @param params - Request parameters.
   * @param params.assetIds - CAIP asset types to quote.
   * @param params.vsCurrency - Quote currency (defaults to `usd`).
   * @param refreshCache - When true, bypasses the cache for this call.
   * @returns A promise that resolves to spot price entries keyed by asset ID.
   * Omitted or null entries mean the API did not return data for that asset.
   */
  async getSpotPrices(
    {
      assetIds,
      vsCurrency = 'usd',
    }: {
      assetIds: CaipAssetType[];
      vsCurrency?: VsCurrencyParam | string;
    },
    refreshCache: boolean = false,
  ): Promise<Partial<SpotPricesResponse>> {
    return this.#getCachedSpotPrices(assetIds, vsCurrency, refreshCache);
  }

  /**
   * Internal caching for {@link PriceService.getSpotPrices}:
   * - Uses `mget` / `mset` for batch reads and writes.
   * - One cache entry per asset and quote currency.
   * - On partial hits, fetches only assets missing from the cache.
   *
   * @param tokenCaip19Types - CAIP-19 asset IDs to quote.
   * @param vsCurrency - Quote currency.
   * @param refreshCache - When true, bypasses the cache for this call.
   * @returns Spot prices keyed by asset ID.
   */
  async #getCachedSpotPrices(
    tokenCaip19Types: CaipAssetType[],
    vsCurrency: VsCurrencyParam | string = 'usd',
    refreshCache: boolean = false,
  ): Promise<Partial<SpotPricesResponse>> {
    const uniqueAssetTypes = [...new Set(tokenCaip19Types)];

    const cacheKeyPrefix = 'PriceService:getSpotPrices';

    const toCacheKey = (tokenCaipAssetType: CaipAssetType): string =>
      `${cacheKeyPrefix}:${tokenCaipAssetType}:${vsCurrency}`;

    let cachedSpotPricesRecord: Record<string, Serializable> = {};
    // Continue even if there is an error fetching the cached spot prices
    try {
      cachedSpotPricesRecord = refreshCache
        ? {}
        : await this.#cache.mget(uniqueAssetTypes.map(toCacheKey));
    } catch (error) {
      this.#logger.warn('Error fetching cached spot prices', error);
      await trackError(error);
    }

    const cachedSpotPricesByAssetId: Partial<SpotPricesResponse> = {};
    const nonCachedAssetTypes: CaipAssetType[] = [];
    for (const assetType of uniqueAssetTypes) {
      const value = cachedSpotPricesRecord[toCacheKey(assetType)];
      // Not found in cache
      if (value === undefined) {
        // Add to query list
        nonCachedAssetTypes.push(assetType);
      } else {
        // Add to result
        cachedSpotPricesByAssetId[assetType] = value as SpotPrice | null;
      }
    }

    // if there are no assets to query, return the cached results
    if (nonCachedAssetTypes.length === 0) {
      return cachedSpotPricesByAssetId;
    }

    let nonCachedSpotPrices: Partial<SpotPricesResponse> = {};
    // Continue even if there is an error caching the spot prices
    try {
      // The Price API can return null for assets it has no quote for, e.g.
      //   { 'stellar:.../asset:USDC-...': null }
      // We cache that null instead of omitting the key, so later requests reuse
      // the cache rather than calling the API again. After TTL expires, a refetch
      // can store a real SpotPrice once the API starts returning one.
      nonCachedSpotPrices = await this.#getSpotPrices(
        nonCachedAssetTypes,
        vsCurrency,
      );

      await this.#cache.mset(
        Object.entries(nonCachedSpotPrices).map(
          ([tokenCaipAssetType, spotPrice]) => ({
            key: toCacheKey(tokenCaipAssetType as CaipAssetType),
            value: spotPrice,
            ttlMilliseconds: AppConfig.cache.ttlMilliseconds.spotPrices,
          }),
        ),
      );
    } catch (error) {
      this.#logger.warn('Error caching spot prices', error);
      await trackError(error);
    }

    return {
      ...cachedSpotPricesByAssetId,
      ...nonCachedSpotPrices,
    };
  }

  async #getSpotPrices(
    assetIds: CaipAssetType[],
    vsCurrency: VsCurrencyParam | string = 'usd',
  ): Promise<Partial<SpotPricesResponse>> {
    if (assetIds.length === 0) {
      return {};
    }
    const deduplicatedAssetIds = [...new Set(assetIds)];

    const spotPrices = await this.#priceApiClient.getSpotPrices(
      deduplicatedAssetIds,
      vsCurrency,
    );
    return spotPrices;
  }
}
