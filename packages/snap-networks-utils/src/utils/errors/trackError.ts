import { getJsonError, UserRejectedRequestError } from '@metamask/snaps-sdk';
import type { TrackErrorParams, TrackErrorResult } from '@metamask/snaps-sdk';
import { ensureError } from '@metamask/utils';

import type {
  CreateWithCatchAndThrowSnapErrorOptions,
  LogErrorFn,
  TrackErrorFn,
} from './errors';
import { createWithCatchAndThrowSnapError } from './errors';

/**
 * Converts a caught value into an {@link Error} before Sentry serialization.
 */
export type PrepareErrorForTrackingFn = (error: unknown) => Error;

/**
 * Determines whether an error should be reported through `snap_trackError`.
 */
export type ShouldTrackErrorFn = (error: unknown) => boolean;

/**
 * `snap_trackError` request shape from `@metamask/snaps-sdk`.
 */
export type SnapTrackErrorRequest = {
  method: 'snap_trackError';
  params: TrackErrorParams;
};

/**
 * Snap provider surface required for {@link createTrackError}, derived from SDK
 * `snap_trackError` types.
 */
export type TrackErrorCapableProvider = {
  request: (
    args: SnapTrackErrorRequest,
  ) => Promise<TrackErrorResult | undefined>;
};

export type CreateTrackErrorOptions<
  TProvider extends TrackErrorCapableProvider = TrackErrorCapableProvider,
> = {
  getSnapProvider: () => TProvider;
  logError: LogErrorFn;
  prepareError?: PrepareErrorForTrackingFn;
  shouldTrack?: ShouldTrackErrorFn;
};

export type CreateSnapErrorHandlingOptions<
  TProvider extends TrackErrorCapableProvider = TrackErrorCapableProvider,
> = Omit<CreateWithCatchAndThrowSnapErrorOptions, 'trackError'> &
  CreateTrackErrorOptions<TProvider>;

function defaultPrepareError(error: unknown): Error {
  return error instanceof Error ? error : ensureError(error);
}

function defaultShouldTrack(error: unknown): boolean {
  return !(error instanceof UserRejectedRequestError);
}

/**
 * Creates a snap-bound error reporter for MetaMask Sentry (`snap_trackError`).
 *
 * RPC failures are caught and logged but never rethrown, so the returned function
 * is safe to call from already-failing error-handling paths.
 *
 * @param options - Snap provider accessor, logger, and optional hooks.
 * @param options.getSnapProvider - Returns the Snap provider used for `snap_trackError`.
 * @param options.logError - Logger method used when the tracking RPC fails.
 * @param options.prepareError - Optional error normalizer before Sentry serialization.
 * @param options.shouldTrack - Optional filter; defaults to skipping `UserRejectedRequestError`.
 * @returns A function that reports errors to Sentry when {@link ShouldTrackErrorFn} allows it.
 */
export function createTrackError<TProvider extends TrackErrorCapableProvider>({
  getSnapProvider,
  logError,
  prepareError = defaultPrepareError,
  shouldTrack = defaultShouldTrack,
}: CreateTrackErrorOptions<TProvider>): TrackErrorFn {
  return async (error: unknown): Promise<string | undefined> => {
    if (!shouldTrack(error)) {
      return undefined;
    }

    const params: TrackErrorParams = {
      error: getJsonError(prepareError(error)),
    };

    try {
      return await getSnapProvider().request({
        method: 'snap_trackError',
        params,
      });
    } catch (trackingError) {
      logError({ error: trackingError }, 'Failed to track error');
      return undefined;
    }
  };
}

/**
 * Creates snap error handling utilities wired with a shared transport and logger setup.
 *
 * @param options - Options for both {@link createTrackError} and
 * {@link createWithCatchAndThrowSnapError}.
 * @param options.logError - Logger method used for handler and tracking failures.
 * @param options.normalizeErrorFn - Optional Snap RPC error normalizer for handler boundaries.
 * @param options.getSnapProvider - Returns the Snap provider used for `snap_trackError`.
 * @param options.prepareError - Optional error normalizer before Sentry serialization.
 * @param options.shouldTrack - Optional tracking filter passed to {@link createTrackError}.
 * @returns Bound `trackError` and `withCatchAndThrowSnapError` functions.
 */
export function createSnapErrorHandling<
  TProvider extends TrackErrorCapableProvider,
>({
  logError,
  normalizeErrorFn,
  getSnapProvider,
  prepareError,
  shouldTrack,
}: CreateSnapErrorHandlingOptions<TProvider>): {
  trackError: TrackErrorFn;
  withCatchAndThrowSnapError: ReturnType<
    typeof createWithCatchAndThrowSnapError
  >;
} {
  const trackError = createTrackError({
    getSnapProvider,
    logError,
    prepareError,
    shouldTrack,
  });

  return {
    trackError,
    withCatchAndThrowSnapError: createWithCatchAndThrowSnapError({
      logError,
      trackError,
      normalizeErrorFn,
    }),
  };
}
