import {
  SnapsAssetsMigrationStage,
  parseSnapsAssetsMigrationStage,
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
} from '@metamask/assets-controller';
import type { RemoteFeatureFlagsProvider } from '@metamask/snap-networks-utils';

import type {
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip2ChainId,
} from '../../api';
import type { CoreAssetsAdapter } from './adapters/CoreAssetsAdapter';
import { parseCoreStellarAsset, parseCoreAssetMetadata } from './api';
import type { CoreAsset, CoreAssetMetadata } from './api';

/**
 * Assets service to read Assets balance and metadata from CoreAssetsAdapter.
 */
export class AssetsService {
  readonly #coreAdapter: CoreAssetsAdapter;

  readonly #remoteFeatureFlagsProvider: RemoteFeatureFlagsProvider;

  constructor({
    coreAdapter,
    remoteFeatureFlagsProvider,
  }: {
    coreAdapter: CoreAssetsAdapter;
    remoteFeatureFlagsProvider: RemoteFeatureFlagsProvider;
  }) {
    this.#coreAdapter = coreAdapter;
    this.#remoteFeatureFlagsProvider = remoteFeatureFlagsProvider;
  }

  /**
   * Returns whether Stellar should read assets from
   * AssetsController instead of snap state.
   *
   * Any migration stage other than Off enables Core reads.
   *
   * @returns Whether the Stellar assets migration flag is active.
   */
  async isMigrationEnabled(): Promise<boolean> {
    const flagValue = await this.#remoteFeatureFlagsProvider.getFeatureFlag(
      SNAPS_ASSETS_MIGRATION_FLAG_KEYS.stellar,
    );

    return (
      parseSnapsAssetsMigrationStage(flagValue) !==
      SnapsAssetsMigrationStage.Off
    );
  }

  /**
   * Returns Core metadata for a Stellar asset.
   *
   * @param assetId - The CAIP-19 id of the asset.
   * @returns The asset metadata, or `null` when Core misses or the payload is not valid.
   * @throws {CoreAssetsAdapterException} When the Core read fails.
   */
  async getAssetMetadata(
    assetId: KnownCaip19AssetIdOrSlip44Id,
  ): Promise<CoreAssetMetadata | null> {
    const metadata = await this.#coreAdapter.getAssetMetadata(assetId);

    return parseCoreAssetMetadata(metadata);
  }

  /**
   * Returns one account asset parsed into the Stellar asset shape.
   *
   * @param accountId - The id of the account.
   * @param assetId - The CAIP-19 id of the asset.
   * @returns The asset, or `null` when Core misses or the row is not Stellar.
   * @throws {InvalidCoreAssetException} When the id is Stellar but the row is invalid.
   * @throws {CoreAssetsAdapterException} When the Core read fails.
   */
  async getAccountAssetByID(
    accountId: string,
    assetId: KnownCaip19AssetIdOrSlip44Id,
  ): Promise<CoreAsset | null> {
    const asset = await this.#coreAdapter.getAccountAssetByID(
      accountId,
      assetId,
    );

    return parseCoreStellarAsset(asset);
  }

  /**
   * Returns account assets for the given ids, in the same order.
   *
   * @param accountId - The id of the account.
   * @param assetIds - The CAIP-19 ids of the assets.
   * @returns Parsed assets. A non-Stellar row is `null`. An empty id list is `[]`.
   * @throws {InvalidCoreAssetException} When an id is Stellar but the row is invalid.
   * @throws {CoreAssetsAdapterException} When the Core read fails.
   */
  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: KnownCaip19AssetIdOrSlip44Id[],
  ): Promise<(CoreAsset | null)[]> {
    if (assetIds.length === 0) {
      return [];
    }

    const assets = await this.#coreAdapter.getAccountAssetsByIDs(
      accountId,
      assetIds,
    );

    return assets.map((asset) => parseCoreStellarAsset(asset));
  }

  /**
   * Returns Stellar account assets for one chain. Non-Stellar assets are dropped.
   *
   * @param scope - The CAIP-2 chain id.
   * @param accountId - The id of the account.
   * @returns The parsed Stellar assets.
   * @throws {InvalidCoreAssetException} When a Stellar row is invalid.
   * @throws {CoreAssetsAdapterException} When the Core read fails.
   */
  async getAccountAssetsByScope(
    scope: KnownCaip2ChainId,
    accountId: string,
  ): Promise<CoreAsset[]> {
    const assets = await this.#coreAdapter.getAccountAssetsByScope(
      scope,
      accountId,
    );

    return assets.flatMap((asset) => {
      const parsed = parseCoreStellarAsset(asset);
      return parsed === null ? [] : [parsed];
    });
  }

  /**
   * Returns Stellar account assets across mainnet and testnet. Non-Stellar assets are dropped.
   *
   * @param accountId - The id of the account.
   * @returns The parsed Stellar assets.
   * @throws {InvalidCoreAssetException} When a Stellar row is invalid.
   * @throws {CoreAssetsAdapterException} When the Core read fails.
   */
  async getAccountAssets(accountId: string): Promise<CoreAsset[]> {
    const assets = await this.#coreAdapter.getAccountAssets(accountId);

    return assets.flatMap((asset) => {
      const parsed = parseCoreStellarAsset(asset);
      return parsed === null ? [] : [parsed];
    });
  }
}
