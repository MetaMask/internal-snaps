import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
  parseSnapsAssetsMigrationStage,
} from '@metamask/assets-controller';
import type {
  ExtendedKeyringAccount,
  RemoteFeatureFlagsProvider,
} from '@metamask/snap-networks-utils';
/* eslint-disable jsdoc/require-returns */
import type { CaipAssetType, CaipChainId } from '@metamask/utils';

import type { AssetEntity } from '../../../entities';
import type { CoreAssetsAdapter } from './adapters/CoreAssetsAdapter';
import { SnapAssetsAdapter } from './adapters/SnapAssetsAdapter';
import type { AssetMetadata } from './types';

/**
 * Assets domain facade. Reads and sync fetch/save use the Snap adapter while
 * migration is off. Once migration is active, reads go through the Core
 * adapter (the AssetsController).
 */
export class AssetsService {
  readonly #snapAdapter: SnapAssetsAdapter;

  readonly #coreAdapter: CoreAssetsAdapter;

  readonly #remoteFeatureFlagsProvider: RemoteFeatureFlagsProvider;

  readonly cacheTtlsMilliseconds: typeof SnapAssetsAdapter.cacheTtlsMilliseconds;

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
    this.cacheTtlsMilliseconds = SnapAssetsAdapter.cacheTtlsMilliseconds;
  }

  /**
   * Whether the Solana assets migration is active, as told by the per-network
   * migration remote feature flag. Once active, asset reads go through the
   * Core adapter, and saving the Snap's own asset state is silent: local
   * state stays warm, but no keyring events are emitted.
   */
  async isAssetsMigrationEnabled(): Promise<boolean> {
    const flagValue = await this.#remoteFeatureFlagsProvider.getFeatureFlag(
      SNAPS_ASSETS_MIGRATION_FLAG_KEYS.solana,
    );

    return (
      parseSnapsAssetsMigrationStage(flagValue) !==
      SnapsAssetsMigrationStage.Off
    );
  }

  static hasChanged(asset: AssetEntity, assetsLookup: AssetEntity[]): boolean {
    return SnapAssetsAdapter.hasChanged(asset, assetsLookup);
  }

  async getAssetsMetadata(
    assetTypes: CaipAssetType[],
  ): Promise<Record<CaipAssetType, AssetMetadata | null>> {
    return this.#snapAdapter.getAssetsMetadata(assetTypes);
  }

  /**
   * Fetches live assets and balances for the given account from the chain.
   * Migration-aware: once the assets migration is active, the fetch goes
   * through the AssetsController fetch pipeline; until then, it hits the
   * Solana RPC nodes directly through the Snap adapter.
   *
   * @param account - The account to fetch live assets for.
   * @returns The live assets.
   */
  async fetchAccountAssets(
    account: ExtendedKeyringAccount,
  ): Promise<AssetEntity[]> {
    return this.#snapAdapter.fetchAccountAssets(account);
  }

  /**
   * Fetches live assets and balances for the given account directly from the
   * Solana RPC nodes through the Snap adapter. The fallback path for live
   * asset fetching: it never consults the assets migration feature flag.
   *
   * @param account - The account to fetch live assets for.
   * @returns The live assets.
   */
  async fetchAccountAssetsFromRpc(
    account: ExtendedKeyringAccount,
  ): Promise<AssetEntity[]> {
    return this.#snapAdapter.fetchAccountAssets(account);
  }

  async save(asset: AssetEntity): Promise<void> {
    await this.saveMany([asset]);
  }

  /**
   * Persists the given assets to the Snap's local state. While the assets
   * migration is active, this is silent: the AssetsController owns the
   * client's asset view, so no keyring events are emitted. Otherwise, the
   * corresponding keyring events are emitted too.
   *
   * @param assets - The assets to persist.
   */
  async saveMany(assets: AssetEntity[]): Promise<void> {
    if (await this.isAssetsMigrationEnabled()) {
      return this.#snapAdapter.saveMany(assets);
    }

    return this.#snapAdapter.saveManyAndEmit(assets);
  }

  async getAll(): Promise<AssetEntity[]> {
    return this.#snapAdapter.getAll();
  }

  /**
   * Returns a single account asset by CAIP-19 ID, or `null` if missing.
   *
   * @param accountId - Keyring account ID.
   * @param assetId - CAIP-19 asset ID.
   */
  async getAccountAssetByID(
    accountId: string,
    assetId: CaipAssetType,
  ): Promise<AssetEntity | null> {
    if (await this.isAssetsMigrationEnabled()) {
      return this.#coreAdapter.getAccountAssetByID(accountId, assetId);
    }

    return this.#snapAdapter.getAccountAssetByID(accountId, assetId);
  }

  /**
   * Returns account assets for the given CAIP-19 IDs, keyed by asset ID.
   * Missing assets are `null`.
   *
   * @param accountId - Keyring account ID.
   * @param assetIds - CAIP-19 asset IDs to resolve.
   */
  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: CaipAssetType[],
  ): Promise<Record<CaipAssetType, AssetEntity | null>> {
    if (await this.isAssetsMigrationEnabled()) {
      const assets = await this.#coreAdapter.getAccountAssetsByIDs(
        accountId,
        assetIds,
      );

      return Object.fromEntries(
        assetIds.map((assetId, index) => [assetId, assets[index] ?? null]),
      ) as Record<CaipAssetType, AssetEntity | null>;
    }

    return this.#snapAdapter.getAccountAssetsByIDs(accountId, assetIds);
  }

  /**
   * Returns controller-backed assets for an account on the given Solana scope.
   *
   * @param scope - CAIP-2 chain ID to filter results.
   * @param accountId - Keyring account ID.
   */
  async getAccountAssetsByScope(
    scope: CaipChainId,
    accountId: string,
  ): Promise<AssetEntity[]> {
    if (await this.isAssetsMigrationEnabled()) {
      return this.#coreAdapter.getAccountAssetsByScope(scope, accountId);
    }

    return this.#snapAdapter.getAccountAssetsByScope(scope, accountId);
  }

  /**
   * Returns assets for an account across all active Solana networks.
   *
   * @param accountId - Keyring account ID.
   */
  async getAccountAssets(accountId: string): Promise<AssetEntity[]> {
    if (await this.isAssetsMigrationEnabled()) {
      return this.#coreAdapter.getAccountAssets(accountId);
    }

    return this.#snapAdapter.getAccountAssets(accountId);
  }

  async findByAccount(account: ExtendedKeyringAccount): Promise<AssetEntity[]> {
    return this.#snapAdapter.findByAccount(account);
  }
}
