import type { Caip19AssetId } from '@metamask/assets-controller';
import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
  parseSnapsAssetsMigrationStage,
} from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import type { RemoteFeatureFlagsProvider } from '@metamask/snap-networks-utils';

import type { Network } from '../../constants';
import { parseTronCaipAssetType } from '../../utils/caip';
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

    assetIds.forEach((assetId) => {
      parseTronCaipAssetType(assetId);
    });

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
    parseTronCaipAssetType(assetId);

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
      return this.#coreAdapter.fetchAssetsAndBalancesForAccount(scope, account);
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

  /**
   * Fetches fresh (up-to-date) assets for the requested asset IDs, for flows
   * that must not act on stale balances.
   *
   * When the assets migration is active, the Core adapter combines the
   * controller's one-time fetch with a direct Tron RPC sync of snap-owned
   * assets. Otherwise, the Snap's own sync flow refreshes and persists the
   * latest values before reading them.
   *
   * @param account - The keyring account to fetch assets for.
   * @param assetIds - CAIP-19 asset IDs to resolve fresh values for.
   * @returns Assets in the same order as the requested asset IDs, with `null`
   * for asset IDs that could not be resolved.
   */
  async getFreshAccountAssetsByIDs(
    account: KeyringAccount,
    assetIds: string[],
  ): Promise<(AssetEntity | null)[]> {
    if (assetIds.length === 0) {
      return [];
    }

    if (await this.#shouldReturnAssetsFromCore()) {
      return this.#coreAdapter.getFreshAccountAssetsByIDs(
        account,
        assetIds as Caip19AssetId[],
      );
    }

    const scopes = [
      ...new Set(
        assetIds.map((assetId) => parseTronCaipAssetType(assetId).chainId),
      ),
    ] as Network[];

    const freshAssets = (
      await Promise.all(
        scopes.map((scope) =>
          this.#snapAdapter.fetchAssetsAndBalancesForAccount(scope, account),
        ),
      )
    ).flat();
    await this.#snapAdapter.saveMany(freshAssets);

    return this.#snapAdapter.getAccountAssetsByIDs(account.id, assetIds);
  }

  /**
   * Fetches a single fresh asset for the given asset ID.
   *
   * @param account - The keyring account to fetch the asset for.
   * @param assetId - CAIP-19 asset ID to resolve a fresh value for.
   * @returns The fresh asset, or `null` if it could not be resolved.
   */
  async getFreshAccountAssetByID(
    account: KeyringAccount,
    assetId: string,
  ): Promise<AssetEntity | null> {
    const [asset] = await this.getFreshAccountAssetsByIDs(account, [assetId]);
    return asset ?? null;
  }
}
