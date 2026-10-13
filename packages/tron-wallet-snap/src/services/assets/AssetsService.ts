import type { Caip19AssetId } from '@metamask/assets-controller';
import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
  parseSnapsAssetsMigrationStage,
} from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import type { RemoteFeatureFlagsProvider } from '@metamask/snap-networks-utils';

import type { AssetEntity } from '../../entities/assets';
import type { CoreAssetsAdapter } from './adapters/CoreAssetsAdapter';
import { SnapAssetsAdapter } from './adapters/SnapAssetsAdapter';

/**
 * Assets domain facade. Reads and snap-owned fetch/save use the Snap adapter
 * while migration is off, and the Core adapter once migration is active. When
 * migration is active, fetch returns only snap-owned assets and save publishes
 * them via keyring events without local persistence.
 */
export class AssetsService {
  readonly #snapAdapter: SnapAssetsAdapter;

  readonly #coreAdapter: CoreAssetsAdapter;

  readonly #remoteFeatureFlagsProvider: RemoteFeatureFlagsProvider;

  constructor({
    snapAdapter,
    coreAdapter,
    remoteFeatureFlagsProvider,
  }: {
    snapAdapter: SnapAssetsAdapter;
    coreAdapter: CoreAssetsAdapter;
    remoteFeatureFlagsProvider: RemoteFeatureFlagsProvider;
  }) {
    this.#snapAdapter = snapAdapter;
    this.#coreAdapter = coreAdapter;
    this.#remoteFeatureFlagsProvider = remoteFeatureFlagsProvider;
  }

  async isAssetsMigrationEnabled(): Promise<boolean> {
    const flagValue = await this.#remoteFeatureFlagsProvider.getFeatureFlag(
      SNAPS_ASSETS_MIGRATION_FLAG_KEYS.tron,
    );
    const result =
      parseSnapsAssetsMigrationStage(flagValue) !==
      SnapsAssetsMigrationStage.Off;
    return result;
  }

  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: string[],
  ): Promise<(AssetEntity | null)[]> {
    if (assetIds.length === 0) {
      return [];
    }

    if (await this.isAssetsMigrationEnabled()) {
      const assets = await this.#coreAdapter.getAccountAssetsByIDs(
        accountId,
        assetIds as Caip19AssetId[],
      );
      return assets;
    }

    return this.#snapAdapter.getAccountAssetsByIDs(accountId, assetIds);
  }

  async getAccountAssetByID(
    accountId: string,
    assetId: string,
  ): Promise<AssetEntity | null> {
    if (await this.isAssetsMigrationEnabled()) {
      const asset = await this.#coreAdapter.getAccountAssetByID(
        accountId,
        assetId as Caip19AssetId,
      );
      return asset;
    }

    return this.#snapAdapter.getAccountAssetByID(accountId, assetId);
  }

  async getAccountAssets(accountId: string): Promise<AssetEntity[]> {
    if (await this.isAssetsMigrationEnabled()) {
      return this.#coreAdapter.getAccountAssets(accountId);
    }

    return this.#snapAdapter.getAccountAssets(accountId);
  }

  /**
   * Fetches live assets and balances for the given account across all its
   * scopes from the chain. Migration-aware: when the migration is active the
   * fetch goes through the AssetsController fetch pipeline, otherwise it
   * hits TronGrid directly through the Snap adapter.
   *
   * @param account - The account to fetch live assets for.
   * @returns The live assets.
   */
  async fetchAccountAssets(account: KeyringAccount): Promise<AssetEntity[]> {
    if (await this.isAssetsMigrationEnabled()) {
      return this.#coreAdapter.fetchAccountAssets(account);
    }

    return this.#snapAdapter.fetchAccountAssets(account);
  }

  /**
   * Fetches live assets and balances for the given account across all its
   * scopes directly from TronGrid through the Snap adapter. The fallback
   * path for live asset fetching: it never consults the migration feature
   * flag.
   *
   * @param account - The account to fetch live assets for.
   * @returns The live assets.
   */
  async fetchAccountAssetsFromTrongrid(
    account: KeyringAccount,
  ): Promise<AssetEntity[]> {
    return this.#snapAdapter.fetchAccountAssets(account);
  }

  /**
   * Persists the latest asset snapshot to the snap's local state and emits
   * the corresponding keyring events. Migration-aware: once the migration is
   * active, Core owns publishing updates and local persistence is skipped.
   *
   * @param assets - The latest asset snapshot to persist.
   * @returns Nothing.
   */
  async saveManyAndEmit(assets: AssetEntity[]): Promise<void> {
    if (await this.isAssetsMigrationEnabled()) {
      return this.#coreAdapter.saveManyAndEmit(assets);
    }

    return this.#snapAdapter.saveManyAndEmit(assets);
  }

  /**
   * Persists the latest asset snapshot to the snap's local state without
   * emitting keyring events. Always writes through the Snap adapter because
   * local state is snap-owned regardless of the migration stage; Core owns
   * publishing updates instead.
   *
   * @param assets - The latest asset snapshot to persist.
   * @returns Nothing.
   */
  async saveMany(assets: AssetEntity[]): Promise<void> {
    return this.#snapAdapter.saveMany(assets);
  }
}
