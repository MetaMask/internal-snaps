import type { Logger } from '@metamask/snap-networks-utils';

import type {
  KnownCaip19AssetId,
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip19MptAssetId,
} from '../../api';
import { KnownCaip2ChainId, AssetType } from '../../api';
import { AppConfig } from '../../config';
import { getXrplAssetChainId, isSlip44Id } from '../../utils';
import type { AssetsService } from '../assets';
import type { MptXrplAssetMetadata, XrplAssetMetadata } from './api';
import type { AssetMetadataRepository } from './AssetMetadataRepository';
import { AssetMetadataServiceException } from './exceptions';
import { TokenApiClient } from './token-api/TokenApiClient';
import {
  getNativeAssetMetadata,
  groupAssetsByChainId,
  toXrplAssetMetadata,
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
   * @param assetId - Native, IOU, or MPT CAIP-19 asset id.
   * @returns Resolved asset data for wallet / transaction use.
   */
  async resolve(
    assetId: KnownCaip19AssetIdOrSlip44Id,
  ): Promise<XrplAssetMetadata> {
    if (isSlip44Id(assetId)) {
      return getNativeAssetMetadata(getXrplAssetChainId(assetId));
    }
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
   * Resolves asset metadata for ids that are not in the watched catalog.
   *
   * @param assetIds - IOU or MPT CAIP-19 asset ids to resolve.
   * @returns Metadata for the ids that could be resolved. Missing ids are omitted.
   */
  async fetchAndPersistAssetsByAssetIds(
    assetIds: KnownCaip19AssetId[],
  ): Promise<XrplAssetMetadata[]> {
    return this.#fetchAndPersistAssetsByAssetIds(assetIds);
  }

  /**
   * Returns all persisted assets for the given scope.
   *
   * @param scope - The chain ID to look up.
   * @returns A Promise that resolves to all persisted assets for the given scope.
   */
  async getAllByScope(scope: KnownCaip2ChainId): Promise<XrplAssetMetadata[]> {
    return this.#assetMetadataRepository.getAllByScope(scope);
  }

  /**
   * Returns all persisted assets for the given scope and type.
   *
   * @param scope - The chain ID to look up.
   * @param assetType - The asset type to look up.
   * @returns A Promise that resolves to all persisted assets for the given scope and type.
   */
  async getAssetsByScopeAndType<TAssetType extends AssetType>(
    scope: KnownCaip2ChainId,
    assetType: TAssetType,
  ): Promise<Extract<XrplAssetMetadata, { assetType: TAssetType }>[]> {
    const assetsMetadata = await this.#assetMetadataRepository.getByAssetType(
      assetType,
      scope,
    );

    return assetsMetadata;
  }

  /**
   * Loads MPT metadata for the requested ids, or the persisted catalog when ids are omitted.
   *
   * Uses the same AssetsController → snap → token API path as
   * {@link fetchAndPersistAssetsByAssetIds}. Ids missing from those sources are
   * omitted (no ledger fallback).
   *
   * @param params - MPT metadata lookup.
   * @param params.scope - CAIP-2 network.
   * @param params.assetIds - MPT asset ids. Omit or pass an empty list to use the persisted catalog.
   * @returns MPT metadata for the requested ids, or the persisted catalog.
   */
  async fetchAndPersistMptAssetMetadata(params: {
    scope: KnownCaip2ChainId;
    assetIds?: KnownCaip19MptAssetId[];
  }): Promise<MptXrplAssetMetadata[]> {
    const { scope, assetIds = [] } = params;
    if (assetIds.length > 0) {
      const assetsMetadata =
        await this.fetchAndPersistAssetsByAssetIds(assetIds);
      return assetsMetadata.filter(
        (asset) => asset.assetType === AssetType.Mpt,
      );
    }

    return this.getAssetsByScopeAndType(scope, AssetType.Mpt);
  }

  /**
   * Fetches and persists all Assets for the given chain ID from the token API.
   *
   * @param scope - The chain ID to fetch and persist assets for.
   */
  async synchronize(scope: KnownCaip2ChainId): Promise<void> {
    const tokensMetadata = (await this.#fetchAssetsByChainId(scope)).filter(
      (asset) => asset.assetType !== AssetType.Mpt,
    );
    await this.#assetMetadataRepository.saveMany(tokensMetadata, true);
  }

  /**
   * Synchronizes the asset catalog if it is stale.
   *
   * @param scope - The chain ID to synchronize the asset catalog for.
   */
  async synchronizeIfStale(scope: KnownCaip2ChainId): Promise<void> {
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
  }

  async #fetchAndPersistAssetsByAssetIds(
    assetIds: KnownCaip19AssetIdOrSlip44Id[],
  ): Promise<XrplAssetMetadata[]> {
    const { nativeAssets: nativeAssetsByChainId, assets: assetsByChainId } =
      groupAssetsByChainId(assetIds);

    const result: XrplAssetMetadata[] = [];
    // fetch native assets
    for (const [chainId] of nativeAssetsByChainId) {
      result.push(getNativeAssetMetadata(chainId));
    }

    // persisted: AssetsController then snap; token API for remaining misses
    const allNonNativeAssetIds = [...assetsByChainId.values()].flat();
    if (allNonNativeAssetIds.length === 0) {
      return result;
    }
    const { assets, missingAssetIds } =
      await this.#getPersistedAssetMetadata(allNonNativeAssetIds);

    if (missingAssetIds.length === 0) {
      return result.concat(assets);
    }

    // A missing token API / controller row is not persisted and not invented
    // from the ledger (including MPT issuances).
    const { assets: assetsToPersist } =
      await this.#fetchTokenAssetsFromApi(missingAssetIds);

    if (assetsToPersist.length > 0) {
      await this.#assetMetadataRepository.saveMany(assetsToPersist);
    }

    return result.concat(assets, assetsToPersist);
  }

  /**
   * Resolves persisted metadata. AssetsController first, then snap state for
   * remaining ids.
   *
   * @param assetIds - Non-native CAIP-19 ids to look up.
   * @returns Hits plus ids still missing after persisted lookups.
   */
  async #getPersistedAssetMetadata(assetIds: KnownCaip19AssetId[]): Promise<{
    assets: XrplAssetMetadata[];
    missingAssetIds: KnownCaip19AssetId[];
  }> {
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

  async #getSnapAssetMetadata(assetIds: KnownCaip19AssetId[]): Promise<{
    hits: XrplAssetMetadata[];
    missing: KnownCaip19AssetId[];
  }> {
    const cachedAssets =
      await this.#assetMetadataRepository.getByAssetIds(assetIds);
    return this.#partitionHitsAndMissingByArray(assetIds, cachedAssets);
  }

  async #getAssetsControllerAssetMetadata(
    assetIds: KnownCaip19AssetId[],
  ): Promise<{
    hits: XrplAssetMetadata[];
    missing: KnownCaip19AssetId[];
  }> {
    const hits: XrplAssetMetadata[] = [];
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
              toXrplAssetMetadata({
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
    assets: XrplAssetMetadata[];
    missingAssetIds: KnownCaip19AssetId[];
  }> {
    if (assetIds.length === 0) {
      return { assets: [], missingAssetIds: [] };
    }

    this.#logger.debug('Fetching token assets from API', { assetIds });
    const tokensMetadata = await this.#fetchAssetsByAssetIds(assetIds);
    const { hits: assets, missing: missingAssetIds } =
      this.#partitionHitsAndMissingByArray(assetIds, tokensMetadata);
    this.#logger.debug('Token assets missing from API', { missingAssetIds });
    return { assets, missingAssetIds };
  }

  async #fetchAssetsByAssetIds(
    assetIds: KnownCaip19AssetId[],
  ): Promise<XrplAssetMetadata[]> {
    const tokenMetadataResponses =
      await this.#tokenApiClient.fetchAssetsByAssetIds(assetIds);
    // Note: it is possible that the token metadata does not contain all the asset ids.
    return tokenMetadataResponses.map((tokenMetadata) =>
      toXrplAssetMetadata({
        assetId: tokenMetadata.assetId,
        decimals: tokenMetadata.decimals,
        symbol: tokenMetadata.symbol,
        name: tokenMetadata.name,
        iconUrl: tokenMetadata.iconUrl,
      }),
    );
  }

  async #fetchAssetsByChainId(
    scope: KnownCaip2ChainId,
  ): Promise<XrplAssetMetadata[]> {
    const tokenMetadataResponses =
      await this.#tokenApiClient.fetchAssetsByChainId(scope);
    return tokenMetadataResponses.data.map((tokenMetadata) =>
      toXrplAssetMetadata({
        assetId: tokenMetadata.assetId,
        decimals: tokenMetadata.decimals,
        symbol: tokenMetadata.symbol,
        name: tokenMetadata.name,
        iconUrl: tokenMetadata.iconUrl,
      }),
    );
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
