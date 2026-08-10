import type { KeyringAccount } from '@metamask/keyring-api';

import type { AccountResources } from '../../../clients/tron-http';
import type { Network } from '../../../constants';
import { Networks } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';

/**
 * Extracts current and maximum energy from the account resources.
 *
 * @param options - Options object.
 * @param options.account - The keyring account.
 * @param options.scope - The network.
 * @param options.tronAccountResources - Account resources (energy, bandwidth).
 * @returns Array containing energy and maximum energy assets.
 */
export function extractEnergy({
  account,
  scope,
  tronAccountResources,
}: {
  account: KeyringAccount;
  scope: Network;
  tronAccountResources: AccountResources | Record<string, never>;
}): AssetEntity[] {
  const maximumEnergy = tronAccountResources?.EnergyLimit ?? 0;
  const usedEnergy = tronAccountResources?.EnergyUsed ?? 0;

  /**
   * We might have used more Energy than the maximum allocated
   */
  const availableEnergy = Math.max(0, maximumEnergy - usedEnergy);

  return [
    {
      assetType: Networks[scope].energy.id,
      keyringAccountId: account.id,
      network: scope,
      symbol: Networks[scope].energy.symbol,
      decimals: Networks[scope].energy.decimals,
      rawAmount: availableEnergy.toString(),
      uiAmount: availableEnergy.toString(),
      iconUrl: Networks[scope].energy.iconUrl,
    },
    {
      assetType: Networks[scope].maximumEnergy.id,
      keyringAccountId: account.id,
      network: scope,
      symbol: Networks[scope].maximumEnergy.symbol,
      decimals: Networks[scope].maximumEnergy.decimals,
      rawAmount: maximumEnergy.toString(),
      uiAmount: maximumEnergy.toString(),
      iconUrl: Networks[scope].maximumEnergy.iconUrl,
    },
  ];
}
