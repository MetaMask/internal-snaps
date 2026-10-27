import { createSnapErrorHandling } from '@metamask/snap-networks-utils';
import { UserRejectedRequestError } from '@metamask/snaps-sdk';

import { getSnapProvider } from '../clients/snap/getSnapProvider';
import { failureStreakGate, getStreakGatedMessage } from './failureStreakGate';
import logger from './logger';
import { isOpenCircuitError } from './openCircuitBypass';
import { sanitizeSensitiveError } from './sensitiveErrors';

export { isSnapRpcError, sanitizeSensitiveError } from './sensitiveErrors';

/**
 * Whether an error is reported to Sentry. Not reported:
 * - user rejections (the default);
 * - the fetch policy's open-circuit short-circuit, detected by class, flag,
 *   name or message through the cause chain (the keyring SDK rethrows it as a
 *   plain `Error` with the same message): no request was made, and the
 *   failures that opened the circuit were already reported;
 * - repeats of a streak-gated failure ('Failed to fetch account info'): only
 *   the first failure of a streak is reported, then a reminder at most every
 *   15 minutes while it lasts (see `FailureStreakGate`).
 *
 * @param error - The error.
 * @returns `true` if the error should be tracked.
 */
export function shouldTrack(error: unknown): boolean {
  if (error instanceof UserRejectedRequestError || isOpenCircuitError(error)) {
    return false;
  }
  const gatedMessage = getStreakGatedMessage(error);
  return (
    gatedMessage === undefined || failureStreakGate.shouldReport(gatedMessage)
  );
}

export const { trackError, withCatchAndThrowSnapError } =
  createSnapErrorHandling({
    getSnapProvider,
    logError: logger.error.bind(logger),
    prepareError: sanitizeSensitiveError,
    shouldTrack,
  });
