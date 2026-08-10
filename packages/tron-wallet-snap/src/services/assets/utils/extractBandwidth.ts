import type { KeyringAccount } from '@metamask/keyring-api';

import type { AccountResources } from '../../../clients/tron-http';
import type { Network } from '../../../constants';
import { Networks } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';

/**
 * Extracts current and maximum bandwidth from the account resources.
 *
 * @param options - Options object.
 * @param options.account - The account to extract bandwidth for.
 * @param options.scope - The network to extract bandwidth for.
 * @param options.tronAccountResources - The account resources to extract bandwidth for.
 * @returns The bandwidth assets.
 */
export function extractBandwidth({
  account,
  scope,
  tronAccountResources,
}: {
  account: KeyringAccount;
  scope: Network;
  tronAccountResources: AccountResources | Record<string, never>;
}): AssetEntity[] {
  const freeBandwidth = tronAccountResources?.freeNetLimit ?? 0;
  const stakingBandwidth = tronAccountResources?.NetLimit ?? 0;
  const maximumBandwidth = freeBandwidth + stakingBandwidth;

  const usedFreeBandwidth = tronAccountResources?.freeNetUsed ?? 0;
  const usedStakingBandwidth = tronAccountResources?.NetUsed ?? 0;
  const usedBandwidth = usedFreeBandwidth + usedStakingBandwidth;

  const availableBandwidth = Math.max(0, maximumBandwidth - usedBandwidth);

  return [
    {
      assetType: Networks[scope].bandwidth.id,
      keyringAccountId: account.id,
      network: scope,
      symbol: Networks[scope].bandwidth.symbol,
      decimals: Networks[scope].bandwidth.decimals,
      rawAmount: availableBandwidth.toString(),
      uiAmount: availableBandwidth.toString(),
      iconUrl: Networks[scope].bandwidth.iconUrl,
    },
    {
      assetType: Networks[scope].maximumBandwidth.id,
      keyringAccountId: account.id,
      network: scope,
      symbol: Networks[scope].maximumBandwidth.symbol,
      decimals: Networks[scope].maximumBandwidth.decimals,
      rawAmount: maximumBandwidth.toString(),
      uiAmount: maximumBandwidth.toString(),
      iconUrl: Networks[scope].maximumBandwidth.iconUrl,
    },
  ];
}
