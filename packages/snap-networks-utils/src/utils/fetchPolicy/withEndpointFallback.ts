import { BrokenCircuitError } from '@metamask/base-data-service';

import type { FetchPolicyError } from './createFetchPolicy';
import { FetchPolicyErrorName } from './createFetchPolicy';

/**
 * Decides whether a failed call to the primary endpoint should be repeated
 * against a fallback endpoint.
 *
 * Fallback is meant for failures that say nothing about the request itself:
 * the transport never produced a readable response (a CORS-blocked or reset
 * connection surfaces as a bare `TypeError: Failed to fetch`), the call timed
 * out, the primary's circuit is open, or the server reported a 5xx / 429.
 * A readable 4xx (other than 429) is an answer about the request and is not
 * retried elsewhere.
 *
 * Note that in a browser an HTTP/2-coalesced request that the server answers
 * with a 404 *without* CORS headers is indistinguishable from a network
 * failure, so it qualifies for fallback.
 *
 * @param error - The error thrown by the primary call.
 * @returns `true` if the call should be retried against the fallback.
 */
export const shouldUseFallbackEndpoint = (error: unknown): boolean => {
  if (error instanceof BrokenCircuitError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return true;
  }
  if ((error as { name?: unknown }).name === 'AbortError') {
    return false;
  }
  const { name, httpStatus } = error as FetchPolicyError;
  if (
    name === FetchPolicyErrorName.Network ||
    name === FetchPolicyErrorName.Timeout
  ) {
    return true;
  }
  if (httpStatus === undefined) {
    // Unknown error without a status: treat as transport-level.
    return true;
  }
  return httpStatus === 429 || httpStatus >= 500;
};

export type WithEndpointFallbackOptions = {
  /**
   * Called when the primary failed and the fallback is about to be used.
   */
  onFallback?: (error: unknown) => void;
  /**
   * Overrides {@link shouldUseFallbackEndpoint}.
   */
  shouldFallback?: (error: unknown) => boolean;
};

/**
 * Runs `primary`, and when it fails with a transport-level error (see
 * {@link shouldUseFallbackEndpoint}) runs `fallback` instead. When no
 * fallback is configured the primary error is rethrown unchanged.
 *
 * Each operation should already be wrapped in its own fetch policy, so the
 * primary is retried with backoff first and its circuit breaker, once open,
 * routes calls straight to the fallback without hitting the primary.
 *
 * If the fallback fails too, the **primary** error is rethrown (with the
 * fallback error attached as `fallbackError`) so callers keep classifying
 * the original failure.
 *
 * @param primary - The call against the primary endpoint.
 * @param fallback - The call against the fallback endpoint, if any.
 * @param options - Options.
 * @returns The result of whichever call succeeded.
 */
export async function withEndpointFallback<Result>(
  primary: () => Promise<Result>,
  fallback: (() => Promise<Result>) | undefined,
  options: WithEndpointFallbackOptions = {},
): Promise<Result> {
  try {
    return await primary();
  } catch (primaryError) {
    const shouldFallback =
      options.shouldFallback ?? shouldUseFallbackEndpoint;
    if (!fallback || !shouldFallback(primaryError)) {
      throw primaryError;
    }
    options.onFallback?.(primaryError);
    try {
      return await fallback();
    } catch (fallbackError) {
      if (primaryError instanceof Error) {
        Object.assign(primaryError, { fallbackError });
      }
      throw primaryError;
    }
  }
}
