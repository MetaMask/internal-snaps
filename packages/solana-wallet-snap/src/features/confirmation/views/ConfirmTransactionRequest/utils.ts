import type { FetchStatus } from '../../../../core/types/snap';

/**
 * Single source of truth for whether the confirm action must be disabled.
 *
 * Per the transaction warning contract, confirm is disabled only by:
 * - the first-load scan being in flight (`fetching`), or
 * - a locally detected expired blockhash.
 * Remote execution failures and unavailable scans do not block confirmation.
 *
 * Background re-scans never re-set `fetching`, so refresh loading does not
 * disable confirm.
 * A malicious verdict never disables confirm: the user must always retain a
 * "proceed anyway" path, gated behind the shared malicious acknowledgement
 * screen and `requiresMaliciousAcknowledgement` from
 * `@metamask/snap-networks-utils`.
 *
 * @param params - Scan state.
 * @param params.scanFetchStatus - Latest transaction scan fetch status.
 * @param params.transactionExpired - Whether a local check detected expiry.
 * @returns True when the confirm action should be disabled.
 */
export function shouldDisableConfirmation(params: {
  scanFetchStatus: FetchStatus;
  transactionExpired?: boolean;
}): boolean {
  return (
    params.scanFetchStatus === 'fetching' || params.transactionExpired === true
  );
}
