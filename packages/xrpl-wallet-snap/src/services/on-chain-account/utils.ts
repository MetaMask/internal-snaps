import { BigNumber } from 'bignumber.js';

import {
  ACCOUNT_MINIMUM_BASE_RESERVE_UNIT,
  BASE_RESERVE_DROPS,
  DROPS_PER_XRP,
  XRP_PER_BASE_RESERVE_ACCOUNT,
  XRP_PER_BASE_RESERVE_OWNER_ITEM,
} from '../../constants';
import { XrplAccountFlags } from './OnChainAccount';

type CalculateSpendableBalanceParams = {
  /** Total native balance in drops. */
  nativeBalance: BigNumber;
} & ReserveLedgerMeta;

/**
 * Reserve inputs from `account_data`.
 *
 * `ownerCount` is always present. The XLS-68 counts are omitted by rippled
 * when they are zero, and `paysOwnBaseReserve` is true when `Sponsor` is omitted (this
 * account pays its own base reserve).
 */
export type ReserveLedgerMeta = {
  /** Objects this account owns (`OwnerCount`). */
  ownerCount: number;
  /** Accounts whose base reserve this account pays. */
  sponsoringAccountCount: number;
  /** Objects this account sponsors for other accounts. */
  sponsoringOwnerCount: number;
  /** Objects this account owns that another account sponsors. */
  sponsoredOwnerCount: number;
  /**
   * True when this account pays its own 1 XRP base reserve
   * (`account_data.Sponsor` omitted). False when another account sponsors it.
   */
  paysOwnBaseReserve: boolean;
};

/**
 * Reserve meta from an `account_info` `account_data` object.
 *
 * Omitted XLS-68 counts are zero. `paysOwnBaseReserve` is true when `Sponsor` is absent.
 *
 * @param accountData - `account_info.account_data`.
 * @returns Fields stored on {@link OnChainAccount} and passed to {@link minimumBalanceDrops}.
 */
export function reserveMetaFromAccountData(accountData: {
  OwnerCount: number;
  SponsoringAccountCount?: number;
  SponsoringOwnerCount?: number;
  SponsoredOwnerCount?: number;
  Sponsor?: string;
}): ReserveLedgerMeta {
  return {
    ownerCount: accountData.OwnerCount,
    sponsoringAccountCount: accountData.SponsoringAccountCount ?? 0,
    sponsoringOwnerCount: accountData.SponsoringOwnerCount ?? 0,
    sponsoredOwnerCount: accountData.SponsoredOwnerCount ?? 0,
    paysOwnBaseReserve: accountData.Sponsor === undefined,
  };
}

/**
 * Minimum account balance in drops for reserve calculation.
 *
 * Account reserve is 1 XRP when `paysOwnBaseReserve` is true, plus 1 XRP for each
 * `sponsoringAccountCount`. Owner reserve is 0.2 XRP for
 * `ownerCount - sponsoredOwnerCount + sponsoringOwnerCount`.
 *
 * @param meta - Ledger fields from `account_info` or a persisted snapshot.
 * @returns Minimum balance in drops.
 */
export function minimumBalanceDrops(meta: ReserveLedgerMeta): BigNumber {
  const accountUnits = new BigNumber(
    meta.paysOwnBaseReserve ? ACCOUNT_MINIMUM_BASE_RESERVE_UNIT : 0,
  ).plus(meta.sponsoringAccountCount);
  const ownerUnits = BigNumber.maximum(
    new BigNumber(meta.ownerCount)
      .minus(meta.sponsoredOwnerCount)
      .plus(meta.sponsoringOwnerCount),
    0,
  );
  const accountReserve = accountUnits.times(XRP_PER_BASE_RESERVE_ACCOUNT);
  const ownerReserve = ownerUnits.times(XRP_PER_BASE_RESERVE_OWNER_ITEM);
  return accountReserve.plus(ownerReserve).times(DROPS_PER_XRP);
}

/**
 * Best-effort ledger meta from AssetsController native `minimumReserveBalance` (drops).
 *
 * A total of at least 1 XRP is this account's own base reserve (`paysOwnBaseReserve`)
 * plus 0.2 XRP owner objects. A smaller total does not include that base
 * reserve. Sponsorship counts stay 0. Prefer {@link reserveMetaFromAccountData}
 * when `account_info` is available.
 *
 * @param minimumReserveBalanceDrops - AssetsController `minimumReserveBalance` (integer drops).
 * @returns Ledger meta derived from that total.
 */
export function calculateLedgerMetaFromMinReserve(
  minimumReserveBalanceDrops: string,
): ReserveLedgerMeta {
  const reserveDrops = new BigNumber(minimumReserveBalanceDrops);
  const baseReserveDrops = new BigNumber(XRP_PER_BASE_RESERVE_ACCOUNT).times(
    DROPS_PER_XRP,
  );
  const ownerReserveDrops = new BigNumber(BASE_RESERVE_DROPS);
  const empty = {
    sponsoringAccountCount: 0,
    sponsoringOwnerCount: 0,
    sponsoredOwnerCount: 0,
  };

  if (!reserveDrops.isFinite() || reserveDrops.isLessThanOrEqualTo(0)) {
    return {
      ...empty,
      ownerCount: 0,
      paysOwnBaseReserve: false,
    };
  }

  if (reserveDrops.isGreaterThanOrEqualTo(baseReserveDrops)) {
    return {
      ...empty,
      ownerCount: reserveDrops
        .minus(baseReserveDrops)
        .dividedToIntegerBy(ownerReserveDrops)
        .toNumber(),
      paysOwnBaseReserve: true,
    };
  }

  return {
    ...empty,
    ownerCount: reserveDrops.dividedToIntegerBy(ownerReserveDrops).toNumber(),
    paysOwnBaseReserve: false,
  };
}

/**
 * Spendable native balance (drops): total native minus {@link minimumBalanceDrops}.
 *
 * @param params - Total native balance and ledger reserve fields.
 * @param params.nativeBalance - Total native balance in drops.
 * @returns Spendable native balance in drops (clamped at zero).
 * @see https://developers.xrpl.org/docs/learn/fundamentals/xrpl-data-structures/accounts#minimum-balance
 */
export function calculateSpendableBalance(
  params: CalculateSpendableBalanceParams,
): BigNumber {
  const { nativeBalance, ...reserveBalanceParams } = params;
  const minBalanceDrops = minimumBalanceDrops({
    ...reserveBalanceParams,
  });

  return BigNumber.maximum(nativeBalance.minus(minBalanceDrops), 0);
}

/**
 * Copies enabled AccountRoot flags into a JSON object.
 *
 * @param flags - Parsed `lsf*` flags. Absent means the account is not fully bound.
 * @returns Flags whose value is `true`.
 */
export function getEnabledFlags(
  flags: XrplAccountFlags | undefined,
): Record<string, boolean> {
  const enabled: Record<string, boolean> = {};
  if (flags === undefined) {
    return enabled;
  }
  for (const [name, value] of Object.entries(flags)) {
    if (value === true) {
      enabled[name] = true;
    }
  }
  return enabled;
}
