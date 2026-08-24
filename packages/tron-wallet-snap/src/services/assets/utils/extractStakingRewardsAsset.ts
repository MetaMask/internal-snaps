import type { KeyringAccount } from '@metamask/keyring-api';

import type { Network } from '../../../constants';
import { Networks } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';
import { toUiAmount } from '../../../utils/conversion';

/**
 * Extracts staking rewards asset (unclaimed voting rewards).
 *
 * @param account - The keyring account.
 * @param scope - The network.
 * @param stakingRewards - Unclaimed staking rewards in sun.
 * @returns The staking rewards asset.
 */
export function extractStakingRewardsAsset(
  account: KeyringAccount,
  scope: Network,
  stakingRewards: number,
): AssetEntity {
  return {
    assetType: Networks[scope].stakingRewards.id,
    keyringAccountId: account.id,
    network: scope,
    symbol: Networks[scope].stakingRewards.symbol,
    decimals: Networks[scope].stakingRewards.decimals,
    rawAmount: stakingRewards.toString(),
    uiAmount: toUiAmount(
      stakingRewards,
      Networks[scope].stakingRewards.decimals,
    ).toString(),
    iconUrl: Networks[scope].stakingRewards.iconUrl,
  };
}
