/* eslint-disable jsdoc/require-returns */
import type { FungibleAssetMarketData } from '@metamask/snaps-sdk';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';

import type { AssetEntity, SolanaKeyringAccount } from '../../../entities';
import type { CoreAssetsAdapter } from './adapters/CoreAssetsAdapter';
import { SnapAssetsAdapter } from './adapters/SnapAssetsAdapter';
import type { AssetMetadata } from './types';

/**
 * Assets domain facade. Currently delegates all behavior to SnapAssetsAdapter
 * (legacy snap-owned reads/writes). Core adapter is initialized for upcoming
 * routing without changing callers.
 */
export class AssetsService {
  readonly #snapAdapter: SnapAssetsAdapter;

  // Initialized for upcoming Core routing; not read until the migration PR lands.
  // eslint-disable-next-line no-unused-private-class-members -- reserved adapter slot
  readonly #coreAdapter: CoreAssetsAdapter;

  readonly cacheTtlsMilliseconds: typeof SnapAssetsAdapter.cacheTtlsMilliseconds;

  constructor({
    snapAdapter,
    coreAdapter,
  }: {
    snapAdapter: SnapAssetsAdapter;
    coreAdapter: CoreAssetsAdapter;
  }) {
    this.#snapAdapter = snapAdapter;
    this.#coreAdapter = coreAdapter;
    this.cacheTtlsMilliseconds = SnapAssetsAdapter.cacheTtlsMilliseconds;
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
    return this.#snapAdapter.getAccountAssetsByScope(scope, accountId);
  }

  /**
   * Returns assets for an account across all active Solana networks.
   *
   * @param accountId - Keyring account ID.
   */
  async getAccountAssets(accountId: string): Promise<AssetEntity[]> {
    return this.#snapAdapter.getAccountAssets(accountId);
  }

  async findByAccount(account: SolanaKeyringAccount): Promise<AssetEntity[]> {
    return this.#snapAdapter.findByAccount(account);
  }
}
