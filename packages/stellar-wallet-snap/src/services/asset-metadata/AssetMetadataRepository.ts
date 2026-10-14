import type { IStateManager } from '@metamask/snap-networks-utils';
import { cloneDeep } from 'lodash';

import type {
  AssetType,
  KnownCaip19AssetId,
  KnownCaip2ChainId,
} from '../../api';
import type {
  AssetMetadataByAssetId,
  AssetMetadataState,
  StellarAssetMetadata,
} from './api';

export class AssetMetadataRepository {
  readonly #state: IStateManager<AssetMetadataState>;

  readonly #stateKey = 'assets';

  constructor(state: IStateManager<AssetMetadataState>) {
    this.#state = state;
  }

  /**
   * Returns persisted asset for the given asset ID.
   *
   * @param assetId - The asset ID to look up.
   * @returns A Promise that resolves to the persisted asset if found, otherwise `null`.
   */
  async getByAssetId(
    assetId: KnownCaip19AssetId,
  ): Promise<StellarAssetMetadata | null> {
    const assets =
      (await this.#state.getKey<AssetMetadataByAssetId>(this.#stateKey)) ?? {};
    return assets[assetId] ?? null;
  }

  /**
   * Returns persisted assets for the given IDs, shaped like `AssetMetadataState.assets`.
   * Only keys present in storage are included; missing IDs are omitted.
   *
   * @param assetIds - The asset IDs to look up.
   * @returns A Promise that resolves to the subset of the persisted `assets` map for those IDs.
   */
  async getByAssetIds(
    assetIds: KnownCaip19AssetId[],
  ): Promise<StellarAssetMetadata[]> {
    const assets =
      (await this.#state.getKey<AssetMetadataByAssetId>(this.#stateKey)) ?? {};

    const result: StellarAssetMetadata[] = [];

    for (const assetId of assetIds) {
      const asset = assets[assetId];
      if (asset !== undefined) {
        result.push(asset);
      }
    }
    return result;
  }

  /**
   * Returns all persisted assets.
   *
   * @returns A Promise that resolves to all persisted assets.
   */
  async getAll(): Promise<StellarAssetMetadata[]> {
    const assets =
      (await this.#state.getKey<AssetMetadataByAssetId>(this.#stateKey)) ?? {};

    return Object.values(assets).filter(
      (row): row is StellarAssetMetadata => row !== undefined,
    );
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
    const assets =
      (await this.#state.getKey<AssetMetadataByAssetId>(this.#stateKey)) ?? {};

    return Object.values(assets).filter(
      (asset): asset is StellarAssetMetadata => asset?.chainId === scope,
    );
  }

  /**
   * Returns persisted assets for the given asset type and chain ID.
   *
   * @param assetType - The asset type to look up.
   * @param scope - The chain ID to look up.
   * @returns A Promise that resolves to the persisted assets for the given asset type and chain ID.
   */
  async getByAssetType(
    assetType: AssetType,
    scope: KnownCaip2ChainId,
  ): Promise<StellarAssetMetadata[]> {
    const assets =
      (await this.#state.getKey<AssetMetadataByAssetId>(this.#stateKey)) ?? {};

    return Object.values(assets).filter(
      (asset): asset is StellarAssetMetadata =>
        asset?.assetType === assetType && asset?.chainId === scope,
    );
  }

  /**
   * Upserts rows by `assetId` and stamps each row's `persistedAt`.
   *
   * When `fullSync` is true, also stamps `assetMetadataLastSyncedAt` so catalog
   * TTL checks measure the last successful full token-list sync — not point lookups.
   * An empty `assets` array is a no-op (including when `fullSync` is true), so a
   * successful empty catalog leaves the catalog marked stale and will retry.
   *
   * @param assets - Full metadata rows; `assetId` must match the CAIP-19 key for that network.
   * @param fullSync - Whether to stamp `assetMetadataLastSyncedAt`. Defaults to `false`.
   */
  async saveMany(
    assets: StellarAssetMetadata[],
    fullSync: boolean = false,
  ): Promise<void> {
    if (assets.length === 0) {
      return;
    }
    const persistedAt = Date.now();
    await this.#state.update((stateValue) => {
      const newState = cloneDeep(stateValue);

      for (const asset of assets) {
        newState.assets[asset.assetId] = {
          ...asset,
          persistedAt,
        };
      }
      if (fullSync) {
        newState.assetMetadataLastSyncedAt = persistedAt;
      }
      return newState;
    });
  }

  /**
   * Whether the token API asset catalog should be refreshed.
   *
   * Compares `assetMetadataLastSyncedAt` (set only by a successful non-empty
   * full catalog `saveMany(..., true)`) against `ttl`. Missing timestamps are
   * treated as stale so legacy state and empty catalogs re-sync.
   *
   * @param ttl - Maximum age in milliseconds before the catalog is stale.
   * @returns `true` when no catalog sync timestamp exists or it is older than `ttl`.
   */
  async isStale(ttl: number): Promise<boolean> {
    const assetMetadataLastSyncedAt = await this.#state.getKey<number>(
      'assetMetadataLastSyncedAt',
    );

    // Legacy / never-synced state — refresh once to stamp the catalog timestamp.
    if (assetMetadataLastSyncedAt === undefined) {
      return true;
    }

    return Date.now() - assetMetadataLastSyncedAt > ttl;
  }
}
