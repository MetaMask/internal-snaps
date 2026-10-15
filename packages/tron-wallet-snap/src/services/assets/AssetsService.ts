import type { Caip19AssetId } from '@metamask/assets-controller';
import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
  parseSnapsAssetsMigrationStage,
} from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import type { RemoteFeatureFlagsProvider } from '@metamask/snap-networks-utils';

import { Networks } from '../../constants';
import type { Network } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import { extractScopesFromAssetIds } from '../../utils/caip';
import type { CoreAssetsAdapter } from './adapters/CoreAssetsAdapter';
import { SnapAssetsAdapter } from './adapters/SnapAssetsAdapter';

/**
 * Assets domain facade. Reads and sync fetch/save use the Snap adapter while
 * migration is off. Once migration is active, the Snap no longer synchronizes
 * assets itself: reads go through the Core adapter, and fresh reads fetch
 * everything (including special assets) through the controller's fetch
 * pipeline.
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
   * scopes directly from TronGrid through the Snap adapter. Only used by the
   * Snap's sync job, which is skipped once the assets migration is active.
   *
   * @param account - The account to fetch live assets for.
   * @returns The live assets.
   */
  async fetchAccountAssets(account: KeyringAccount): Promise<AssetEntity[]> {
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
   * the corresponding keyring events.
   *
   * @param assets - The latest asset snapshot to persist.
   * @returns Nothing.
   */
  async saveManyAndEmit(assets: AssetEntity[]): Promise<void> {
    return this.#snapAdapter.saveManyAndEmit(assets);
  }

  /**
   * Persists the latest asset snapshot to the snap's local state without
   * emitting keyring events. Only used by the Snap's sync job, which is
   * skipped once the assets migration is active.
   *
   * @param assets - The latest asset snapshot to persist.
   * @returns Nothing.
   */
  async saveMany(assets: AssetEntity[]): Promise<void> {
    return this.#snapAdapter.saveMany(assets);
  }

  /**
   * Fetches fresh (up-to-date) assets for the requested asset IDs, for flows
   * that must not act on stale balances.
   *
   * When the assets migration is active, everything (including special
   * assets) is fetched through the controller's one-time fetch pipeline.
   * Otherwise, the Snap's own sync flow refreshes and persists the latest
   * values before reading them.
   *
   * @param account - The keyring account to fetch assets for.
   * @param assetIds - CAIP-19 asset IDs to resolve fresh values for.
   * @throws {@link AssetFetchError} When the fresh fetch fails.
   * @returns Assets in the same order as the requested asset IDs, with `null`
   * for asset IDs that could not be resolved.
   */
  async fetchAccountAssetsByIDs(
    account: KeyringAccount,
    assetIds: Caip19AssetId[],
  ): Promise<(AssetEntity | null)[]> {
    if (assetIds.length === 0) {
      return [];
    }

    if (await this.isAssetsMigrationEnabled()) {
      return this.#coreAdapter.fetchAccountAssetsByIDs(account, assetIds);
    }

    const scopes = extractScopesFromAssetIds(assetIds);

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
  async fetchAccountAssetByID(
    account: KeyringAccount,
    assetId: Caip19AssetId,
  ): Promise<AssetEntity | null> {
    const [asset] = await this.fetchAccountAssetsByIDs(account, [assetId]);
    return asset ?? null;
  }

  /**
   * Fetches fresh (up-to-date) account resources (Bandwidth and Energy) for
   * the given account and scope, for flows that must not estimate fees on
   * stale resources.
   *
   * @param account - The keyring account to fetch resources for.
   * @param scope - The network scope to fetch resources for.
   * @throws {@link AssetFetchError} When the fresh fetch fails.
   * @returns The fresh bandwidth and energy assets, or `null` for either
   * when it could not be resolved.
   */
  async fetchAccountResources(
    account: KeyringAccount,
    scope: Network,
  ): Promise<{ bandwidth: AssetEntity | null; energy: AssetEntity | null }> {
    const [bandwidth, energy] = await this.fetchAccountAssetsByIDs(account, [
      Networks[scope].bandwidth.id,
      Networks[scope].energy.id,
    ]);

    return { bandwidth: bandwidth ?? null, energy: energy ?? null };
  }
}
