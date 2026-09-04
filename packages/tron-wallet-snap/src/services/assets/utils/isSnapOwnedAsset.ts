import type { CaipAssetType } from '@metamask/utils';

import { SNAP_OWNED_ASSETS } from '../../../constants';

const SNAP_OWNED_ASSET_IDS = new Set<CaipAssetType>(
  SNAP_OWNED_ASSETS as CaipAssetType[],
);

/**
 * Returns whether an asset remains exclusively managed by the Snap.
 *
 * AssetsController does not persist certain Tron protocol assets, including
 * staking positions and account resources. These assets must always be read,
 * synchronized, persisted, and published by the Snap, regardless of the
 * assets migration stage.
 *
 * @param assetId - CAIP-19 asset ID.
 * @returns Whether the asset is exclusively managed by the Snap.
 */
export function isSnapOwnedAsset(assetId: CaipAssetType): boolean {
  return SNAP_OWNED_ASSET_IDS.has(assetId);
}
