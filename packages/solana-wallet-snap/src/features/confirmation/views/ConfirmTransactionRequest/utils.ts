import type { TransactionScanResult } from '../../../../core/services/transaction-scan/types';
import type { FetchStatus } from '../../../../core/types/snap';

/**
 * Single source of truth for whether the confirm action must be disabled.
 *
 * Per the transaction warning contract, confirm is disabled only by:
 * - the first-load scan being in flight (`fetching`), or
 * - a locally invalid transaction (scan status `ERROR`: simulation revert,
 *   expired blockhash, ...).
 *
 * Background re-scans never re-set `fetching`, so they never disable confirm.
 * A malicious verdict never disables confirm: the user must always retain a
 * "proceed anyway" path, gated behind the shared malicious acknowledgement
 * screen and `requiresMaliciousAcknowledgement` from
 * `@metamask/snap-networks-utils`.
 *
 * @param params - Scan state.
 * @param params.scanFetchStatus - Latest transaction scan fetch status.
 * @param params.scan - Latest transaction scan result.
 * @returns True when the confirm action should be disabled.
 */
export function shouldDisableConfirmation(params: {
  scanFetchStatus: FetchStatus;
  scan: TransactionScanResult | null;
}): boolean {
  return params.scanFetchStatus === 'fetching' || isScanErrored(params.scan);
}

/**
 * Determines whether a scan result reports a locally invalid transaction.
 *
 * A scan `ERROR` means the transaction would fail on-chain (simulation revert,
 * expired blockhash, ...), so confirm is disabled (fail-closed) with an
 * explanatory banner.
 *
 * @param scan - Latest transaction scan result.
 * @returns True when the scan reports the transaction as invalid.
 */
export function isScanErrored(scan: TransactionScanResult | null): boolean {
  return scan?.status === 'ERROR';
}
