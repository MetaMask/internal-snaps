/**
 * Minimum fee rate, in sat/vB, that can be used to build a transaction.
 *
 * BDK's `FeeRate` takes an integer and a rate of 0 produces a transaction with
 * no fee at all, so any positive rate must be kept at or above this floor.
 */
export const MIN_FEE_RATE_SAT_PER_VB = 1;

/**
 * Whether a fee rate can be used to build a transaction.
 *
 * Fee estimates come from a remote estimator, so a missing (`undefined`), zero,
 * negative, or non-finite value must be treated as unusable rather than passed
 * through as a zero fee rate.
 *
 * @param feeRate - The candidate fee rate in sat/vB.
 * @returns `true` if the rate is a finite, strictly positive number.
 */
function isUsableFeeRate(feeRate: number | undefined): feeRate is number {
  return typeof feeRate === 'number' && Number.isFinite(feeRate) && feeRate > 0;
}

/**
 * Selects the fee rate to use from a remote estimate, falling back when the
 * estimate cannot be used.
 *
 * A nullish check (`??`) is not enough: estimators can legitimately answer with
 * `0` (empty mempool, indexing hiccup) or with a fractional value below
 * 1 sat/vB on quiet networks. Both would otherwise build a zero-fee
 * transaction. Any positive estimate is kept, clamped to
 * {@link MIN_FEE_RATE_SAT_PER_VB} so it never truncates to zero downstream.
 *
 * @param estimate - The raw estimate for the target confirmation, in sat/vB.
 * @param fallbackFeeRate - The rate to use when the estimate is unusable.
 * @returns A usable fee rate in sat/vB.
 */
export function resolveFeeRate(
  estimate: number | undefined,
  fallbackFeeRate: number,
): number {
  if (!isUsableFeeRate(estimate)) {
    return fallbackFeeRate;
  }

  return Math.max(MIN_FEE_RATE_SAT_PER_VB, estimate);
}

/**
 * Converts a fee rate in sat/vB to the integer value BDK's `FeeRate`
 * constructor expects, without truncating a positive rate to zero.
 *
 * Estimators return fractional sat/vB values (e.g. `0.285`); flooring those to
 * an integer would silently build a zero-fee transaction. Any positive rate
 * below 1 sat/vB is therefore rounded up to {@link MIN_FEE_RATE_SAT_PER_VB}.
 * Unusable (non-positive or non-finite) rates map to 0, which callers are
 * expected to have already filtered out via {@link resolveFeeRate}.
 *
 * @param feeRate - The fee rate in sat/vB.
 * @returns The fee rate as a whole number of sat/vB.
 */
export function toFeeRateSatsPerVb(feeRate: number): bigint {
  if (!isUsableFeeRate(feeRate)) {
    return BigInt(0);
  }

  return BigInt(Math.max(MIN_FEE_RATE_SAT_PER_VB, Math.floor(feeRate)));
}
