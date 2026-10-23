import type { Logger } from '@metamask/snap-networks-utils';

import type {
  KnownCaip19AssetId,
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip19Sep41AssetId,
} from '../../api';
import { KnownCaip2ChainId, AssetType } from '../../api';
import { AppConfig } from '../../config';
import type { AssetsService } from '../assets';
import type { Sep41StellarAssetMetadata, StellarAssetMetadata } from './api';
import type { AssetMetadataRepository } from './AssetMetadataRepository';
import { AssetMetadataServiceException } from './exceptions';
import type { TokenMetadata } from './token-api/api';
import { TokenApiClient } from './token-api/TokenApiClient';
import {
  getNativeAssetMetadata,
  groupAssetsByChainId,
  toStellarAssetMetadata,
} from './utils';

/**
 * Resolves CAIP-19 asset identifiers and caches fungible asset metadata for lookups.
 */
export class AssetMetadataService {
  readonly #tokenApiClient: TokenApiClient;

  readonly #assetMetadataRepository: AssetMetadataRepository;

  readonly #logger: Logger;

  readonly #assetsService: AssetsService;

  constructor({
    assetMetadataRepository,
    logger,
    assetsService,
  }: {
    assetMetadataRepository: AssetMetadataRepository;
    logger: Logger;
    assetsService: AssetsService;
  }) {
    this.#tokenApiClient = new TokenApiClient({
      baseUrl: AppConfig.api.tokenApi.baseUrl,
    });
    this.#assetMetadataRepository = assetMetadataRepository;
    this.#logger = logger.withPrefix('[🪙 AssetMetadataService]');
    this.#assetsService = assetsService;
  }

  /**
   * Loads asset metadata from persisted state, then the token API.
   *
   * Native assets resolve locally. Ids the token API does not return are left
   * unresolved and are not persisted, including unknown mainnet assets and
   * testnet assets.
   *
   * @param assetId - Native, classic, or SEP-41 CAIP-19 asset id.
   * @returns Resolved asset data for wallet / transaction use.
   */
  async resolve(
    assetId: KnownCaip19AssetIdOrSlip44Id,
  ): Promise<StellarAssetMetadata> {
    const assets = await this.#fetchAndPersistAssetsByAssetIds([assetId]);
    const found = assets.find((asset) => asset.assetId === assetId);
    if (!found) {
      throw new AssetMetadataServiceException(
        `Asset metadata not found for asset id: ${assetId}`,
      );
    }
    return found;
  }

  /**
   * Resolves SEP-41 metadata for ids that are not in the watched catalog.
   *
   * Rows already stored in AssetsController or snap state are reused. Newly fetched
   * rows are persisted, same as {@link resolve}. Ids missing from the token API
   * are omitted.
   *
   * @param assetIds - SEP-41 asset ids to resolve.
   * @returns Metadata for the ids that could be resolved. Missing ids are omitted.
   */
  async fetchAssetsByAssetIds(
    assetIds: KnownCaip19Sep41AssetId[],
  ): Promise<StellarAssetMetadata[]> {
    return this.#fetchAndPersistAssetsByAssetIds(assetIds);
  }

  /**
   * Returns all persisted SEP-41 assets for the given chain ID.
   *
   * @param scope - The chain ID to look up.
   * @returns A Promise that resolves to all persisted SEP-41 assets for the given chain ID.
   */
  async getPersistedSep41AssetsMetadata(
    scope: KnownCaip2ChainId,
  ): Promise<Sep41StellarAssetMetadata[]> {
    const persistedAssets = await this.#assetMetadataRepository.getByAssetType(
      AssetType.Sep41,
      scope,
    );

    return persistedAssets;
  }

  /**
   * Returns all persisted assets for the given scope.
   *
   * @param scope - The chain ID to look up.
   * @returns A Promise that resolves to all persisted assets for the given scope.
   */
  async getAllByScope(
    scope: KnownCaip2ChainId,
  ): Promise<StellarAssetMetadata[]> {
    return this.#assetMetadataRepository.getAllByScope(scope);
  }

  /**
   * Returns persisted SEP-41 assets for the given scope, refreshing the token API
   * catalog first when {@link AssetMetadataRepository.isStale} reports the last
   * full catalog sync has expired (or never completed).
   *
   * Used during account / transaction sync so newly listed SEP-41 tokens are
   * picked up without waiting for the hourly `synchronizeAssets` cron.
   *
   * @param scope - The chain ID to look up.
   * @returns A Promise that resolves to all SEP-41 assets for the given scope.
   */
  async fetchSep41AssetsOrSyncOnce(
    scope: KnownCaip2ChainId,
  ): Promise<Sep41StellarAssetMetadata[]> {
    if (
      await this.#assetMetadataRepository.isStale(
        AppConfig.cache.ttlMilliseconds.assetMetadata,
      )
    ) {
      this.#logger.debug('Asset catalog is stale, synchronizing assets', {
        scope,
      });
      await this.synchronize(scope);
    }

    const sep41Assets = await this.getPersistedSep41AssetsMetadata(scope);

    this.#logger.debug('SEP-41 assets found in the state', {
      noOfAssets: sep41Assets.length,
    });

    return sep41Assets;
  }

  /**
   * Fetches and persists all Assets for the given chain ID from the token API.
   *
   * Persists via `saveMany(..., true)` so `assetMetadataLastSyncedAt` advances
   * only for a successful non-empty full catalog write.
   *
   * @param scope - The chain ID to fetch and persist assets for.
   */
  async synchronize(scope: KnownCaip2ChainId): Promise<void> {
    const tokensMetadata = await this.#getAssetsByChainId(scope);
    await this.#assetMetadataRepository.saveMany(tokensMetadata, true);
  }

  async #fetchAndPersistAssetsByAssetIds(
    assetIds: KnownCaip19AssetIdOrSlip44Id[],
  ): Promise<StellarAssetMetadata[]> {
    const { nativeAssets: nativeAssetsByChainId, assets: assetsByChainId } =
      groupAssetsByChainId(assetIds);

    const result: StellarAssetMetadata[] = [];
    // fetch native assets
    for (const [chainId] of nativeAssetsByChainId) {
      result.push(getNativeAssetMetadata(chainId));
    }

    // persisted: AssetsController then snap when migration is on; snap only when off
    const allNonNativeAssetIds = [...assetsByChainId.values()].flat();
    if (allNonNativeAssetIds.length === 0) {
      return result;
    }
    const { assets, missingAssetIds } =
      await this.#getPersistedAssetMetadata(allNonNativeAssetIds);

    if (missingAssetIds.length === 0) {
      return result.concat(assets);
    }

    // A missing token API row is not persisted.
    const { assets: assetsToPersist } =
      await this.#fetchTokenAssetsFromApi(missingAssetIds);

    // backfill in state
    if (assetsToPersist.length > 0) {
      await this.#assetMetadataRepository.saveMany(assetsToPersist);
    }

    return result.concat(assets, assetsToPersist);
  }

  /**
   * Resolves persisted metadata. AssetsController first when the Stellar assets
   * migration flag is on, then snap state for remaining ids. When the flag is
   * off, skip AssetsController and read snap state only.
   *
   * @param assetIds - Non-native CAIP-19 ids to look up.
   * @returns Hits plus ids still missing after persisted lookups.
   */
  async #getPersistedAssetMetadata(assetIds: KnownCaip19AssetId[]): Promise<{
    assets: StellarAssetMetadata[];
    missingAssetIds: KnownCaip19AssetId[];
  }> {
    if (await this.#assetsService.isMigrationEnabled()) {
      const {
        hits: assetsControllerHits,
        missing: missingAssetIdsFromAssetsController,
      } = await this.#getAssetsControllerAssetMetadata(assetIds);

      if (missingAssetIdsFromAssetsController.length === 0) {
        return { assets: assetsControllerHits, missingAssetIds: [] };
      }

      const { hits: snapHits, missing: missingAssetIds } =
        await this.#getSnapAssetMetadata(missingAssetIdsFromAssetsController);

      return {
        assets: [...assetsControllerHits, ...snapHits],
        missingAssetIds,
      };
    }

    const { hits, missing } = await this.#getSnapAssetMetadata(assetIds);
    return { assets: hits, missingAssetIds: missing };
  }

  async #getSnapAssetMetadata(assetIds: KnownCaip19AssetId[]): Promise<{
    hits: StellarAssetMetadata[];
    missing: KnownCaip19AssetId[];
  }> {
    const cachedAssets =
      await this.#assetMetadataRepository.getByAssetIds(assetIds);
    return this.#partitionHitsAndMissingByArray(assetIds, cachedAssets);
  }

  async #getAssetsControllerAssetMetadata(
    assetIds: KnownCaip19AssetId[],
  ): Promise<{
    hits: StellarAssetMetadata[];
    missing: KnownCaip19AssetId[];
  }> {
    const hits: StellarAssetMetadata[] = [];
    const missing: KnownCaip19AssetId[] = [];

    this.#logger.debug('Getting asset metadata from AssetsController', {
      assetIds,
    });
    if (assetIds.length > 0) {
      // The order doesn't matter here, as we are not using the order of the assets.
      await Promise.all(
        assetIds.map(async (assetId) => {
          const metadata = await this.#assetsService.getAssetMetadata(assetId);
          if (metadata) {
            hits.push(
              toStellarAssetMetadata({
                assetId,
                decimals: metadata.decimals,
                symbol: metadata.symbol,
                name: metadata.name,
                iconUrl: metadata.image,
              }),
            );
            return;
          }
          missing.push(assetId);
        }),
      );
    }
    this.#logger.debug('Asset metadata from AssetsController', {
      hits,
      missing,
    });
    return { hits, missing };
  }

  async #fetchTokenAssetsFromApi(assetIds: KnownCaip19AssetId[]): Promise<{
    assets: StellarAssetMetadata[];
    missingAssetIds: KnownCaip19AssetId[];
  }> {
    if (assetIds.length === 0) {
      return { assets: [], missingAssetIds: [] };
    }

    this.#logger.debug('Fetching token assets from API', { assetIds });
    const tokensMetadata = await this.#getAssetsByAssetIds(assetIds);
    const { hits: assets, missing: missingAssetIds } =
      this.#partitionHitsAndMissingByArray(assetIds, tokensMetadata);
    this.#logger.debug('Token assets missing from API', { missingAssetIds });
    return { assets, missingAssetIds };
  }

  async #getAssetsByAssetIds(
    assetIds: KnownCaip19AssetId[],
  ): Promise<StellarAssetMetadata[]> {
    const tokenMetadataResponses =
      await this.#tokenApiClient.getAssetsByAssetIds(assetIds);
    // Note: it is possible that the token metadata does not contain all the asset ids.
    return tokenMetadataResponses.map((tokenMetadata) =>
      this.#toAssetMetadata(tokenMetadata),
    );
  }

  async #getAssetsByChainId(
    scope: KnownCaip2ChainId,
  ): Promise<StellarAssetMetadata[]> {
    const tokenMetadataResponses =
      await this.#tokenApiClient.getAssetsByChainId(scope);
    return tokenMetadataResponses.data.map((tokenMetadata) =>
      this.#toAssetMetadata(tokenMetadata),
    );
  }

  #toAssetMetadata(tokenMetadata: TokenMetadata): StellarAssetMetadata {
    const name = tokenMetadata.name ?? 'UNKNOWN';
    const symbol = tokenMetadata.symbol ?? 'UNKNOWN';

    return toStellarAssetMetadata({
      assetId: tokenMetadata.assetId,
      decimals: tokenMetadata.decimals,
      symbol,
      name,
      iconUrl: tokenMetadata.iconUrl,
    });
  }

  /**
   * For each requested id in order: collect cached row if present, else mark missing.
   *
   * @param ids - Requested asset ids (order preserved for hits).
   * @param cachedRows - Rows from cache or token API (may omit some ids).
   * @returns Hits in `ids` order, plus ids with no matching row.
   */
  #partitionHitsAndMissingByArray<
    TId extends string,
    TValue extends { assetId: string },
  >(ids: TId[], cachedRows: TValue[]): { hits: TValue[]; missing: TId[] } {
    const byId = new Map(cachedRows.map((row) => [row.assetId, row]));
    const hits: TValue[] = [];
    const missing: TId[] = [];

    for (const id of ids) {
      const row = byId.get(id);
      if (row === undefined) {
        missing.push(id);
      } else {
        hits.push(row);
      }
    }

    return { hits, missing };
  }
}
