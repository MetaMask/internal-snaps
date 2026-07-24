import { SnapError, UserRejectedRequestError } from '@metamask/snaps-sdk';

import logger from './logger';
import { isSnapRpcError } from './sensitiveErrors';
import { SnapClient } from '../clients/snap/SnapClient';

const snapClient = new SnapClient({ logger });

export { isSnapRpcError, sanitizeSensitiveError } from './sensitiveErrors';

/**
 * Determines whether an error should be reported through `snap_trackError`.
 *
 * @param error - The error to evaluate.
 * @returns `true` when the error should be tracked.
 */
export function shouldTrackError(error: unknown): boolean {
  return !(error instanceof UserRejectedRequestError);
}

export const withCatchAndThrowSnapError = async <ResponseT>(
  fn: () => Promise<ResponseT>,
): Promise<ResponseT> => {
  try {
    return await fn();
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (errorInstance: any) {
    if (shouldTrackError(errorInstance)) {
      await snapClient.trackError(errorInstance);
    }

    const error = isSnapRpcError(errorInstance)
      ? errorInstance
      : new SnapError(errorInstance);

    logger.error(
      { error },
      `[SnapError] ${JSON.stringify(error.toJSON(), null, 2)}`,
    );

    throw error;
  }
};
