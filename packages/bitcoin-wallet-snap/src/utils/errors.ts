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

export const trackError = createTrackError({
  getSnapProvider,
  logError: logger.error.bind(logger),
  shouldTrack: shouldTrackError,
});
