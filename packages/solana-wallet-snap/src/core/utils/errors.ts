import {
  createWithCatchAndThrowSnapError,
  isSnapRpcError,
} from '@metamask/snap-networks-utils';
import { UserRejectedRequestError, getJsonError } from '@metamask/snaps-sdk';

import logger from './logger';

export { isSnapRpcError };
export type { SnapRpcError } from '@metamask/snap-networks-utils';

/**
 * Reports an error to MetaMask via Sentry (`snap_trackError`).
 *
 * Skips user rejections. Callers decide whether to invoke this for a given
 * error in a given context.
 *
 * @param error - The error to report.
 * @returns The Sentry event ID on success, or `undefined` on failure or if the error is skipped.
 */
export const trackError = async (
  error: unknown,
): Promise<string | undefined> => {
  if (error instanceof UserRejectedRequestError) {
    return undefined;
  }

  try {
    return await snap.request({
      method: 'snap_trackError',
      params: {
        error: getJsonError(error),
      },
    });
  } catch (trackingError) {
    logger.warn({ error: trackingError }, 'Failed to track error');
    return undefined;
  }
};

export const withCatchAndThrowSnapError = createWithCatchAndThrowSnapError({
  logError: logger.error.bind(logger),
  trackError,
});
