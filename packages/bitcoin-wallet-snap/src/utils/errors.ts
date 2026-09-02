import { createTrackError } from '@metamask/snap-networks-utils';
import { UserRejectedRequestError } from '@metamask/snaps-sdk';

import { UserActionError } from '../entities';
import { getSnapProvider } from '../infra/getSnapProvider';
import logger from './logger';

/**
 * Determines whether an error should be reported through `snap_trackError`.
 *
 * @param error - The error to evaluate.
 * @returns `true` when the error should be tracked.
 */
export function shouldTrackError(error: unknown): boolean {
  try {
    if (error instanceof UserRejectedRequestError) {
      return false;
    }

    return !(
      (error as UserActionError)?.message === 'User canceled the confirmation'
    );
  } catch (checkError) {
    logger.error(checkError, 'Failed to determine if error should be tracked');
    return false;
  }
}

/**
 * Tracks an error in MetaMask via Sentry (`snap_trackError`).
 *
 * Skips errors that {@link shouldTrackError} filters out. RPC failures are
 * caught and logged but never rethrown, so this is safe to call from
 * already-failing error-handling paths without masking the original failure.
 *
 * @param error - The error to report to Sentry.
 * @returns The Sentry event ID on success, or `undefined` on failure or if the
 * error is skipped.
 */
export const trackError = createTrackError({
  getSnapProvider,
  logError: logger.error.bind(logger),
  shouldTrack: shouldTrackError,
});
