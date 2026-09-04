import type { Caip19AssetId } from '@metamask/assets-controller';
import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
  parseSnapsAssetsMigrationStage,
} from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import type { RemoteFeatureFlagsProvider } from '@metamask/snap-networks-utils';

import type { Network } from '../../constants';
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

  async #shouldReturnAssetsFromCore(): Promise<boolean> {
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

    if (await this.#shouldReturnAssetsFromCore()) {
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
    if (await this.#shouldReturnAssetsFromCore()) {
      const asset = await this.#coreAdapter.getAccountAssetByID(
        accountId,
        assetId as Caip19AssetId,
      );
      return asset;
    }

    return this.#snapAdapter.getAccountAssetByID(accountId, assetId);
  }

  async fetchAssetsAndBalancesForAccount(
    scope: Network,
    account: KeyringAccount,
  ): Promise<AssetEntity[]> {
    if (await this.#shouldReturnAssetsFromCore()) {
      const assetsAndBalances =
        await this.#coreAdapter.fetchAssetsAndBalancesForAccount(
          scope,
          account,
        );
      return assetsAndBalances;
    }

    return this.#snapAdapter.fetchAssetsAndBalancesForAccount(scope, account);
  }

  async saveMany(assets: AssetEntity[]): Promise<void> {
    if (await this.#shouldReturnAssetsFromCore()) {
      return this.#coreAdapter.saveMany(assets);
    }

    return this.#snapAdapter.saveMany(assets);
  }

  async getAccountAssets(accountId: string): Promise<AssetEntity[]> {
    if (await this.#shouldReturnAssetsFromCore()) {
      return this.#coreAdapter.getAccountAssets(accountId);
    }

    return this.#snapAdapter.getAccountAssets(accountId);
  }
}
