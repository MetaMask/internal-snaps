import type { RemoteFeatureFlagsProvider } from '@metamask/snap-networks-utils';

import type { KnownCaip19AssetIdOrSlip44Id, KnownCaip2ChainId } from '../../api';
import type { CoreAssetsAdapter } from './adapters/CoreAssetsAdapter';
import { parseCoreAsset, parseCoreAssetMetadata } from './api';
import type { CoreAsset, CoreAssetMetadata } from './api';
import { isAssetsMigrationEnabled } from './utils';

/**
 * Core AssetsController facade. Account holdings stay behind the Stellar
 * migration flag. {@link getAssetMetadata} is a Core-only lookup (no snap
 * fallback); domain services consume it and stay the caller-facing API.
 *
 * Account-asset and catalog methods validate controller rows into
 * {@link CoreAsset} / {@link CoreAssetMetadata} before returning. Domain services
 * map those into snap types.
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

  async isMigrationEnabled(): Promise<boolean> {
    return isAssetsMigrationEnabled(this.#remoteFeatureFlagsProvider);
  }

  async getAssetMetadata(
    assetId: KnownCaip19AssetIdOrSlip44Id,
  ): Promise<CoreAssetMetadata | null> {
    const metadata = await this.#coreAdapter.getAssetMetadata(assetId);
    return parseCoreAssetMetadata(metadata);
  }

  async getAccountAssetByID(
    accountId: string,
    assetId: KnownCaip19AssetIdOrSlip44Id,
  ): Promise<CoreAsset | null> {
    const asset = await this.#coreAdapter.getAccountAssetByID(
      accountId,
      assetId,
    );

    return parseCoreAsset(asset);
  }

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

    return assets.map((asset) => parseCoreAsset(asset));
  }

  async getAccountAssetsByScope(
    scope: KnownCaip2ChainId,
    accountId: string,
  ): Promise<CoreAsset[]> {
    const assets = await this.#coreAdapter.getAccountAssetsByScope(
      scope,
      accountId,
    );

    return assets.flatMap((asset) => {
      const parsed = parseCoreAsset(asset);
      return parsed === null ? [] : [parsed];
    });
  }

  async getAccountAssets(accountId: string): Promise<CoreAsset[]> {
    const assets = await this.#coreAdapter.getAccountAssets(accountId);

    return assets.flatMap((asset) => {
      const parsed = parseCoreAsset(asset);
      return parsed === null ? [] : [parsed];
    });
  }
}
