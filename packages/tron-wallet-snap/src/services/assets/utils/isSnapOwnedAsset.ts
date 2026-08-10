import type { CaipAssetType } from '@metamask/utils';

import { Networks, SNAP_OWNED_ASSETS } from '../../../constants';
import type { Network } from '../../../constants';

const SNAP_OWNED_ASSET_IDS = new Set<string>(SNAP_OWNED_ASSETS);

/**
 * Returns the full snap-owned asset ID set for a network scope.
 *
 * Matches the assets produced by `fetchAssetsAndBalancesForAccount` for that
 * scope (staking positions and account resources, including zero balances).
 *
 * @param scope - The network to query.
 * @returns CAIP-19 asset IDs exclusively managed by the Snap on that network.
 */
export function getSnapOwnedAssetIdsForScope(scope: Network): CaipAssetType[] {
  const network = Networks[scope];

  return [
    network.stakedForBandwidth.id,
    network.stakedForEnergy.id,
    network.readyForWithdrawal.id,
    network.stakingRewards.id,
    network.inLockPeriod.id,
    network.bandwidth.id,
    network.maximumBandwidth.id,
    network.energy.id,
    network.maximumEnergy.id,
  ];
}

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
export function isSnapOwnedAsset(assetId: string): boolean {
  return SNAP_OWNED_ASSET_IDS.has(assetId);
}
