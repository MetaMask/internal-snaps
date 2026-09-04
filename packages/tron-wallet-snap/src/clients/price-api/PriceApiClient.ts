/* eslint-disable @typescript-eslint/naming-convention */

import type { CaipAssetType } from '@metamask/keyring-api';
import { UrlStruct, buildUrl } from '@metamask/snap-networks-utils';
import type { Logger, Serializable } from '@metamask/snap-networks-utils';
import { array, assert } from '@metamask/superstruct';
import { CaipAssetTypeStruct } from '@metamask/utils';
import { mapKeys } from 'lodash';

import type { ICache } from '../../caching/ICache';
import { SNAP_OWNED_ASSETS } from '../../constants';
import type { ConfigProvider } from '../../services/config';
import logger from '../../utils/logger';
import type { SpotPrices, VsCurrencyParam } from './types';
import { SpotPricesStruct, VsCurrencyParamStruct } from './types';

export class PriceApiClient {
  readonly #fetch: typeof globalThis.fetch;

  readonly #logger: Logger;

  readonly #baseUrl: string;

  readonly #chunkSize: number;

  readonly #cache: ICache<Serializable>;

  readonly cacheTtlsMilliseconds: {
    spotPrices: number;
  };

  constructor(
    configProvider: ConfigProvider,
    _cache: ICache<Serializable>,
    _fetch: typeof globalThis.fetch = globalThis.fetch,
    _logger: Logger = logger,
  ) {
    const { baseUrl, chunkSize, cacheTtlsMilliseconds } =
      configProvider.get().priceApi;

    assert(baseUrl, UrlStruct);

    this.#fetch = _fetch;
    this.#logger = _logger;
    this.#baseUrl = baseUrl;
    this.#chunkSize = chunkSize;
    this.cacheTtlsMilliseconds = cacheTtlsMilliseconds;

    this.#cache = _cache;
  }

  /**
   * Business logic for `getMultipleSpotPrices`.
   *
   * @param tokenCaipAssetTypes - The CAIP-19 IDs of the tokens to get the spot prices for.
   * @param vsCurrency - The currency to convert the prices to.
   * @returns The spot prices for the tokens.
   */
  async #getMultipleSpotPrices_INTERNAL(
    tokenCaipAssetTypes: CaipAssetType[],
    vsCurrency: VsCurrencyParam | string,
  ): Promise<SpotPrices> {
    try {
      const uniqueTokenCaipAssetTypes = [...new Set(tokenCaipAssetTypes)];

      // Split uniqueTokenCaipAssetTypes into chunks
      const chunks: CaipAssetType[][] = [];
      for (
        let index = 0;
        index < uniqueTokenCaipAssetTypes.length;
        index += this.#chunkSize
      ) {
        chunks.push(
          uniqueTokenCaipAssetTypes.slice(index, index + this.#chunkSize),
        );
      }

      // Make parallel requests for each chunk
      const responses = await Promise.all(
        chunks.map(async (chunk) => {
          const url = buildUrl({
            baseUrl: this.#baseUrl,
            path: '/v3/spot-prices',
            queryParams: {
              vsCurrency,
              assetIds: chunk.join(','),
              includeMarketData: 'true',
            },
          });

          const response = await this.#fetch(url);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const spotPrices = await response.json();
          assert(spotPrices, SpotPricesStruct);

          return spotPrices;
        }),
      );

      // Combine all responses
      const spotPrices = responses.reduce(
        (prices, price) => ({ ...prices, ...price }),
        {},
      );

      // Store in the cache
      await this.#cache.mset(
        tokenCaipAssetTypes.map((tokenCaipAssetType) => ({
          key: `PriceApiClient:getMultipleSpotPrices:${tokenCaipAssetType}:${vsCurrency}`,
          value: spotPrices[tokenCaipAssetType],
          ttlMilliseconds: this.cacheTtlsMilliseconds.spotPrices,
        })),
      );

      return spotPrices;
    } catch (error) {
      this.#logger.error(error, 'Error fetching spot prices');
      throw error;
    }
  }

  /**
   * Internal caching logic for `getMultipleSpotPrices`:
   * - Uses mget/mset for batch operations.
   * - Handles proper cache key management.
   * - Handles partial cache hits (fetches only non-cached conversions).
   *
   * @param tokenCaip19Types - The CAIP-19 IDs of the tokens to get the spot prices for.
   * @param vsCurrency - The currency to convert the prices to.
   * @returns The spot prices for the tokens.
   */
  async #getMultipleSpotPrices_CACHE(
    tokenCaip19Types: CaipAssetType[],
    vsCurrency: VsCurrencyParam | string,
  ): Promise<SpotPrices> {
    const uniqueTokenCaip19Types = [...new Set(tokenCaip19Types)];

    const cacheKeyPrefix = 'PriceApiClient:getMultipleSpotPrices';

    // Shorthand method to generate the cache key
    const toCacheKey = (tokenCaipAssetType: CaipAssetType): string =>
      `${cacheKeyPrefix}:${tokenCaipAssetType}:${vsCurrency}`;

    // Parses back the cache key
    const parseCacheKey = (key: string): RegExpMatchArray => {
      const regex = new RegExp(`^${cacheKeyPrefix}:(.+):(.+)$`, 'u');
      const match = key.match(regex);

      if (!match) {
        throw new Error('Invalid cache key');
      }

      return match;
    };

    // Get the cached spot prices
    const cachedSpotPricesRecord = await this.#cache.mget(
      uniqueTokenCaip19Types.map(toCacheKey),
    );

    // Keys when read from the cache are the cache keys ("PriceApiClient:getMultipleSpotPrices:..."), not the token CAIP-19 IDs, so here we transform them back to the token CAIP-19 types.
    const cachedSpotPricesRecordWithParsedKeys = mapKeys(
      cachedSpotPricesRecord,
      (_unused, key) => parseCacheKey(key)[1],
    );

    // We still need to fetch the spot prices for the tokens that are not cached
    const nonCachedTokenCaip19Types = uniqueTokenCaip19Types.filter(
      (tokenCaip19Type) =>
        cachedSpotPricesRecordWithParsedKeys[tokenCaip19Type] === undefined,
    );

    if (nonCachedTokenCaip19Types.length === 0) {
      return cachedSpotPricesRecordWithParsedKeys as SpotPrices;
    }

    // Fetch the spot prices for the tokens that are not cached
    const nonCachedSpotPrices = await this.#getMultipleSpotPrices_INTERNAL(
      nonCachedTokenCaip19Types,
      vsCurrency,
    );

    // Cache the data
    await this.#cache.mset(
      Object.entries(nonCachedSpotPrices).map(
        ([tokenCaipAssetType, spotPrice]) => ({
          key: toCacheKey(tokenCaipAssetType as CaipAssetType),
          value: spotPrice,
          ttlMilliseconds: this.cacheTtlsMilliseconds.spotPrices,
        }),
      ),
    );

    return {
      ...cachedSpotPricesRecordWithParsedKeys,
      ...nonCachedSpotPrices,
    };
  }

  /**
   * Get multiple spot prices for a list of tokens.
   * It caches the results for 1 hour.
   *
   * @param tokenCaip19Types - The CAIP-19 IDs of the tokens to get the spot prices for.
   * @param vsCurrency - The currency to convert the prices to.
   * @returns The spot prices for the tokens.
   */
  async getMultipleSpotPrices(
    tokenCaip19Types: CaipAssetType[],
    vsCurrency: VsCurrencyParam | string = 'usd',
  ): Promise<SpotPrices> {
    assert(tokenCaip19Types, array(CaipAssetTypeStruct));
    assert(vsCurrency, VsCurrencyParamStruct);

    const filteredTokens = tokenCaip19Types.filter(
      (tokenCaip19Type) => !SNAP_OWNED_ASSETS.includes(tokenCaip19Type),
    );

    return this.#getMultipleSpotPrices_CACHE(filteredTokens, vsCurrency);
  }
}
