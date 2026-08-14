/* eslint-disable jsdoc/require-returns */
import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
  parseSnapsAssetsMigrationStage,
} from '@metamask/assets-controller';
import type { RemoteFeatureFlagsProvider } from '@metamask/snap-networks-utils';
import type { FungibleAssetMarketData } from '@metamask/snaps-sdk';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';

import type { AssetEntity, SolanaKeyringAccount } from '../../../entities';
import type { CoreAssetsAdapter } from './adapters/CoreAssetsAdapter';
import { SnapAssetsAdapter } from './adapters/SnapAssetsAdapter';
import type { AssetMetadata } from './types';

/**
 * Assets domain facade. Reads use the Snap adapter while migration is off, and
 * the Core adapter once migration is active. Solana has no snap-owned assets,
 * so when migration is active fetch returns nothing and save is a no-op —
 * Core owns fungible balances and the Snap does not persist or publish them.
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

  async #shouldReturnAssetsFromCore(): Promise<boolean> {
    const flagValue = await this.#remoteFeatureFlagsProvider.getFeatureFlag(
      SNAPS_ASSETS_MIGRATION_FLAG_KEYS.solana,
    );
    return (
      parseSnapsAssetsMigrationStage(flagValue) !==
      SnapsAssetsMigrationStage.Off
    );
  }

  /**
   * Whether asset reads come from AssetsController. When true, the Snap must
   * not fetch, persist, or websocket-monitor balances — Core already does.
   *
   * @returns Whether the Solana assets migration flag is active.
   */
  async isUsingCoreAssets(): Promise<boolean> {
    return this.#shouldReturnAssetsFromCore();
  }

  static hasChanged(asset: AssetEntity, assetsLookup: AssetEntity[]): boolean {
    return SnapAssetsAdapter.hasChanged(asset, assetsLookup);
  }

  async getAssetsMetadata(
    assetTypes: CaipAssetType[],
  ): Promise<Record<CaipAssetType, AssetMetadata | null>> {
    return this.#snapAdapter.getAssetsMetadata(assetTypes);
  }

  async fetch(account: SolanaKeyringAccount): Promise<AssetEntity[]> {
    if (await this.#shouldReturnAssetsFromCore()) {
      return [];
    }

    return this.#snapAdapter.fetch(account);
  }

  async fetchAssetsMarketData(
    assets: {
      asset: CaipAssetType;
      unit: CaipAssetType;
    }[],
  ): Promise<
    Record<CaipAssetType, Record<CaipAssetType, FungibleAssetMarketData>>
  > {
    return this.#snapAdapter.fetchAssetsMarketData(assets);
  }

  async save(asset: AssetEntity): Promise<void> {
    await this.saveMany([asset]);
  }

  async saveMany(assets: AssetEntity[]): Promise<void> {
    if (await this.#shouldReturnAssetsFromCore()) {
      return;
    }

    return this.#snapAdapter.saveMany(assets);
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
    if (await this.#shouldReturnAssetsFromCore()) {
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
    if (await this.#shouldReturnAssetsFromCore()) {
      return this.#coreAdapter.getAccountAssetsByIDs(accountId, assetIds);
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
    if (await this.#shouldReturnAssetsFromCore()) {
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
    if (await this.#shouldReturnAssetsFromCore()) {
      return this.#coreAdapter.getAccountAssets(accountId);
    }

    return this.#snapAdapter.getAccountAssets(accountId);
  }

  async findByAccount(account: SolanaKeyringAccount): Promise<AssetEntity[]> {
    return this.#snapAdapter.findByAccount(account);
  }
}
