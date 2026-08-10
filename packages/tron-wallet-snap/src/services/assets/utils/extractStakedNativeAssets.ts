import type { KeyringAccount } from '@metamask/keyring-api';

import type { Network } from '../../../constants';
import { Networks } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';
import { toUiAmount } from '../../../utils/conversion';

import type { StakedData } from '../types';

/**
 * Extracts staked TRX assets (for bandwidth and energy).
 *
 * @param account - The keyring account.
 * @param scope - The network.
 * @param stakedData - Staking data including frozen balances and delegated resources.
 * @returns Array of staked assets (always 2: bandwidth and energy, amounts may be 0).
 */
export function extractStakedNativeAssets(
  account: KeyringAccount,
  scope: Network,
  stakedData: StakedData,
): AssetEntity[] {
  let stakedBandwidthAmount = 0;
  let stakedEnergyAmount = 0;

  stakedData.frozenV2?.forEach((frozen) => {
    const amount = frozen.amount ?? 0;

    if (frozen.type === 'ENERGY') {
      stakedEnergyAmount += amount;
    } else if (!frozen.type) {
      // Item without type is for bandwidth
      stakedBandwidthAmount += amount;
    }
  });

  const delegatedBandwidth =
    stakedData.accountResource?.delegated_frozenV2_balance_for_bandwidth ?? 0;
  const delegatedEnergy =
    stakedData.accountResource?.delegated_frozenV2_balance_for_energy ?? 0;

  stakedBandwidthAmount += delegatedBandwidth;
  stakedEnergyAmount += delegatedEnergy;

  return [
    {
      assetType: Networks[scope].stakedForBandwidth.id,
      keyringAccountId: account.id,
      network: scope,
      symbol: Networks[scope].stakedForBandwidth.symbol,
      decimals: Networks[scope].stakedForBandwidth.decimals,
      rawAmount: stakedBandwidthAmount.toString(),
      uiAmount: toUiAmount(
        stakedBandwidthAmount,
        Networks[scope].stakedForBandwidth.decimals,
      ).toString(),
      iconUrl: Networks[scope].stakedForBandwidth.iconUrl,
    },
    {
      assetType: Networks[scope].stakedForEnergy.id,
      keyringAccountId: account.id,
      network: scope,
      symbol: Networks[scope].stakedForEnergy.symbol,
      decimals: Networks[scope].stakedForEnergy.decimals,
      rawAmount: stakedEnergyAmount.toString(),
      uiAmount: toUiAmount(
        stakedEnergyAmount,
        Networks[scope].stakedForEnergy.decimals,
      ).toString(),
      iconUrl: Networks[scope].stakedForEnergy.iconUrl,
    },
  ];
}
