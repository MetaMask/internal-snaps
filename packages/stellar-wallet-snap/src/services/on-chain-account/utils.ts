import { BigNumber } from 'bignumber.js';

import {
  ACCOUNT_MINIMUM_BASE_RESERVE_UNIT,
  BASE_RESERVE_STROOPS,
} from '../../constants';

type CalculateSpendableBalanceParams = {
  nativeBalance: BigNumber;
  subentryCount: number;
  numSponsoring: number;
  numSponsored: number;
};

type MinimumBalanceLedgerMeta = {
  subentryCount: number;
  numSponsoring: number;
  numSponsored: number;
};

/**
 * Minimum account balance in stroops for reserve calculation.
 *
 * @param meta - Ledger fields from Horizon or persisted snapshot.
 * @returns Minimum balance in stroops.
 */
export function minimumBalanceStroops(
  meta: MinimumBalanceLedgerMeta,
): BigNumber {
  return new BigNumber(ACCOUNT_MINIMUM_BASE_RESERVE_UNIT)
    .plus(meta.subentryCount)
    .plus(meta.numSponsoring)
    .minus(meta.numSponsored)
    .times(BASE_RESERVE_STROOPS);
}

/**
 * Best-effort `subentry_count` from Core native `minimumReserveBalance` (stroops).
 *
 * Inverts {@link minimumBalanceStroops} when `numSponsoring` and `numSponsored`
 * are 0: `subentryCount = minimumReserve / BASE_RESERVE − 2`. Clamped at 0.
 *
 * @param minimumReserveBalanceStroops - Core `minimumReserveBalance` (integer stroops).
 * @returns Estimated Horizon `subentry_count`.
 */
export function subentryCountFromMinimumReserveStroops(
  minimumReserveBalanceStroops: string,
): number {
  const reserveUnits = new BigNumber(minimumReserveBalanceStroops).div(
    BASE_RESERVE_STROOPS,
  );
  return BigNumber.maximum(
    reserveUnits.minus(ACCOUNT_MINIMUM_BASE_RESERVE_UNIT),
    0,
  ).toNumber();
}

/**
 * Spendable native balance (stroops): total native minus minimum balance.
 *
 * Minimum balance follows Stellar protocol:
 * `(2 + subentry_count + num_sponsoring − num_sponsored) × base_reserve`.
 *
 * @param params - Total native balance and ledger reserve fields.
 * @param params.nativeBalance - Total native balance in stroops.
 * @param params.subentryCount - Account subentry count (Horizon `subentry_count`).
 * @param params.numSponsoring - Reserves this account sponsors for other entries.
 * @param params.numSponsored - Reserves other accounts sponsor for this account.
 * @returns Spendable native balance in stroops (clamped at zero).
 * @see https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/accounts#minimum-balance
 */
export function calculateSpendableBalance(
  params: CalculateSpendableBalanceParams,
): BigNumber {
  const { nativeBalance, subentryCount, numSponsoring, numSponsored } = params;
  const minBalanceStroops = minimumBalanceStroops({
    subentryCount,
    numSponsoring,
    numSponsored,
  });

  return BigNumber.maximum(nativeBalance.minus(minBalanceStroops), 0);
}
