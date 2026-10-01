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

  /**
   * Fetches live assets and balances for the given account from the chain,
   * for a single scope.
   *
   * @param account - The account to fetch live assets for.
   * @param scope - The scope to fetch live assets for.
   * @returns The live assets.
   */
  async fetchAccountAssetsByScope(
    account: KeyringAccount,
    scope: Network,
  ): Promise<AssetEntity[]> {
    if (await this.#shouldReturnAssetsFromCore()) {
      return this.#coreAdapter.fetchAssetsAndBalancesForAccount(scope, account);
    }

    return this.#snapAdapter.fetchAssetsAndBalancesForAccount(scope, account);
  }

  /**
   * Fetches live assets and balances for the given account across all its
   * scopes from the chain.
   *
   * @param account - The account to fetch live assets for.
   * @returns The live assets.
   */
  async fetchAccountAssets(account: KeyringAccount): Promise<AssetEntity[]> {
    const results = await Promise.all(
      account.scopes.map((scope) =>
        this.fetchAccountAssetsByScope(account, scope as Network),
      ),
    );

    return results.flat();
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
