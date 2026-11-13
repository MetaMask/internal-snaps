import {
  createSnapErrorHandling,
  getSyncFailuresFromSettledResult,
  isReportedFetchPolicyError,
} from '@metamask/snap-networks-utils';
import type { AccountSyncFailure } from '@metamask/snap-networks-utils';
import { UserRejectedRequestError } from '@metamask/snaps-sdk';

import logger from './logger';
import { getSnapProvider } from './snap';

export { isSnapRpcError } from '@metamask/snap-networks-utils';
export type { SnapRpcError } from '@metamask/snap-networks-utils';

export const { trackError, withCatchAndThrowSnapError } =
  createSnapErrorHandling({
    getSnapProvider,
    logError: logger.error.bind(logger),
    shouldTrack: (error) =>
      !(error instanceof UserRejectedRequestError) &&
      !isReportedFetchPolicyError(error),
  });

/**
 * Same as `getSyncFailuresFromSettledResult`, minus the rejections a fetch
 * policy already reported. The failures are stringified into a new error, so
 * `trackError` can no longer recognise them afterwards.
 *
 * @param results - The settled synchronization results.
 * @param accountIds - The account IDs, in the same order as `results`.
 * @returns The failures that still need reporting.
 */
export const getUnreportedSyncFailures = (
  results: PromiseSettledResult<unknown>[],
  accountIds: string[],
): AccountSyncFailure[] =>
  getSyncFailuresFromSettledResult(
    results.map((result) =>
      result.status === 'rejected' && isReportedFetchPolicyError(result.reason)
        ? { status: 'fulfilled', value: undefined }
        : result,
    ),
    accountIds,
  );
