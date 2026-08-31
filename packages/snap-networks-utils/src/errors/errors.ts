import { SnapError, getErrorMessage } from '@metamask/snaps-sdk';

import type { Logger } from '../logger/Logger';
import { isSnapRpcError } from './snapRpcError';
import type { SnapRpcError } from './snapRpcError';

/**
 * Sends an error to the snap's tracking transport (e.g. `snap_trackError`).
 * Whether to invoke this for a given error in a given context is the caller's decision.
 */
export type TrackErrorFn = (error: unknown) => Promise<string | undefined>;

/**
 * Converts a caught value into an error suitable for Snap RPC responses.
 */
export type NormalizeErrorFn = (error: unknown) => SnapRpcError;

/**
 * Normalizes an unknown caught value into a Snap RPC error.
 *
 * Preserves existing Snap RPC errors; otherwise wraps the value in {@link SnapError}.
 *
 * @param error - The caught value.
 * @returns A Snap RPC error.
 */
export function normalizeError(error: unknown): SnapRpcError {
  return isSnapRpcError(error)
    ? error
    : new SnapError(error instanceof Error ? error : getErrorMessage(error));
}

export type CreateWithCatchAndThrowSnapErrorOptions = {
  logError: Logger['error'];
  trackError: TrackErrorFn;
  normalizeErrorFn?: NormalizeErrorFn;
};

/**
 * Creates a handler-boundary error wrapper wired with logger, tracking, and optional error normalization.
 *
 * @param options - Logger, error-tracking transport, and optional custom normalizer.
 * @returns A function that catches errors, tracks them, logs, and rethrows as Snap RPC errors.
 */
export function createWithCatchAndThrowSnapError({
  logError,
  trackError,
  normalizeErrorFn = normalizeError,
}: CreateWithCatchAndThrowSnapErrorOptions) {
  return <ResponseT>(fn: () => Promise<ResponseT>) =>
    withCatchAndThrowSnapErrorHandler(
      logError,
      trackError,
      normalizeErrorFn,
      fn,
    );
}

async function withCatchAndThrowSnapErrorHandler<ResponseT>(
  logError: Logger['error'],
  trackError: TrackErrorFn,
  normalizeErrorFn: NormalizeErrorFn,
  fn: () => Promise<ResponseT>,
): Promise<ResponseT> {
  try {
    return await fn();
  } catch (unknownError) {
    await trackError(unknownError);

    const error = normalizeErrorFn(unknownError);

    logError(
      { error },
      `[SnapError] ${JSON.stringify(error.toJSON(), null, 2)}`,
    );

    throw error;
  }
}
