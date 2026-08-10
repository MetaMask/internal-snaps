import type { KeyringAccount } from '@metamask/keyring-api';

import type { RawTronUnfrozenV2 } from '../../../clients/trongrid/types';
import type { Network } from '../../../constants';
import { Networks } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';
import { toUiAmount } from '../../../utils/conversion';
import type { StakedData } from '../types';

/**
 * Extracts TRX that is in the lock period (unstaked but lock period not yet ended).
 *
 * @param account - The keyring account.
 * @param scope - The network.
 * @param stakedData - Staking data including unfrozen balances.
 * @returns The in-lock-period asset (amount may be 0).
 */
export function extractInLockPeriodAsset(
  account: KeyringAccount,
  scope: Network,
  stakedData: StakedData,
): AssetEntity {
  const currentTimestamp = Date.now();
  let inLockPeriodAmount = 0;

  stakedData.unfrozenV2?.forEach((unfrozen: RawTronUnfrozenV2) => {
    const expireTime = unfrozen.unfreeze_expire_time ?? 0;
    const amount = unfrozen.unfreeze_amount ?? 0;

    if (expireTime > currentTimestamp && amount > 0) {
      inLockPeriodAmount += amount;
    }
  });

  const { id, symbol, decimals, iconUrl } = Networks[scope].inLockPeriod;

  return {
    assetType: id,
    keyringAccountId: account.id,
    network: scope,
    symbol,
    decimals,
    rawAmount: inLockPeriodAmount.toString(),
    uiAmount: toUiAmount(inLockPeriodAmount, decimals).toString(),
    iconUrl,
  };
}
