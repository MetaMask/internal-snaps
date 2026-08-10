import type { TronAccount } from '../../../clients/trongrid/types';
import type { StakedData } from '../types';

/**
 * Builds staking data from a settled account info request.
 *
 * @param tronAccountInfoRequest - The settled promise result from getAccountInfoByAddress.
 * @returns Staking data with empty defaults for inactive accounts.
 */
export function buildStakedData(
  tronAccountInfoRequest: PromiseSettledResult<TronAccount>,
): StakedData {
  if (tronAccountInfoRequest.status === 'rejected') {
    return {
      frozenV2: [],
      unfrozenV2: [],
      accountResource: undefined,
    };
  }

  const tronAccountInfo = tronAccountInfoRequest.value;
  return {
    frozenV2: tronAccountInfo.frozenV2 ?? [],
    unfrozenV2: tronAccountInfo.unfrozenV2 ?? [],
    accountResource: tronAccountInfo.account_resource,
  };
}
