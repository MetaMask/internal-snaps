import type { TransactionScanError } from './types';

/**
 * Marker returned by the security scan when a transaction is rejected because a
 * dApp/contract deadline has passed (e.g. an expired swap/router deadline).
 * Surfaced in the raw simulation error message and, when present, the error
 * details type.
 */
export const TRANSACTION_DEADLINE_PASSED = 'TransactionDeadlinePassed';

/**
 * Internal marker used when the snap's own read-only TAPOS check determines a
 * transaction is no longer broadcastable (expiration passed, or the referenced
 * block has aged out of the 65,536-block TAPOS window, or the ref-block hash no
 * longer matches). The security-API simulation does not validate these
 * protocol-level fields, so the snap surfaces this cause locally.
 */
export const TRANSACTION_TAPOS_EXPIRED = 'TransactionTaposExpired';

/**
 * Checks whether a transaction scan error is an "expired" case — either the
 * dApp/contract deadline passed (reported by the security scan) or the Tron
 * TAPOS validity window expired (detected locally by the snap).
 *
 * Used only to select the friendly banner copy in the confirmation dialog's
 * `TransactionAlert` (via `getErrorMessage`). It does NOT control the submit
 * button: the button is disabled for every failed simulation, including the
 * expired/TAPOS-expired case, so the user is blocked from confirming a
 * transaction that won't broadcast.
 *
 * @param error - The transaction scan error, if any.
 * @returns Whether the error is an expired/deadline failure.
 */
export function isTransactionDeadlinePassedError(
  error: TransactionScanError | null,
): boolean {
  if (!error) {
    return false;
  }

  return (
    error.type === TRANSACTION_DEADLINE_PASSED ||
    error.type === TRANSACTION_TAPOS_EXPIRED ||
    Boolean(error.message?.includes(TRANSACTION_DEADLINE_PASSED))
  );
}
