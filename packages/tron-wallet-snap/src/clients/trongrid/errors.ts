import type { FetchPolicyError } from '@metamask/snap-networks-utils';
import { parseRetryAfter } from '@metamask/snap-networks-utils';

/**
 * Error thrown when a TronGrid HTTP request fails with a non-2xx status.
 * Carries the HTTP status code so callers can react to rate-limiting (429)
 * distinctly from other failures.
 */
export class TrongridHttpError extends Error implements FetchPolicyError {
  readonly status: number;

  readonly httpStatus: number;

  readonly retryAfterMs?: number;

  constructor(status: number, retryAfterMs?: number) {
    super(`HTTP error! status: ${status}`);
    this.name = 'TrongridHttpError';
    this.status = status;
    this.httpStatus = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Specialization of {@link TrongridHttpError} for HTTP 429 (Too Many Requests).
 */
export class TrongridRateLimitError extends TrongridHttpError {
  constructor(retryAfterMs?: number) {
    super(429, retryAfterMs);
    this.name = 'TrongridRateLimitError';
  }
}

/**
 * Minimal shape of a `fetch` response needed to build a typed HTTP error. The
 * SES snap environment restricts the global `Response` type, so only the
 * field consumed here is declared.
 */
type FetchErrorResponse = {
  headers: {
    get(name: string): string | null;
  };
  status: number;
};

/**
 * Build the appropriate {@link TrongridHttpError} subclass from a `fetch`
 * response.
 *
 * @param response - The failing `fetch` response.
 * @returns A `TrongridRateLimitError` for 429, otherwise a `TrongridHttpError`.
 */
export const createTrongridHttpError = (
  response: FetchErrorResponse,
): TrongridHttpError => {
  const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
  if (response.status === 429) {
    return new TrongridRateLimitError(retryAfterMs);
  }

  return new TrongridHttpError(response.status, retryAfterMs);
};

export class TrongridAccountNotFoundError extends Error {
  constructor() {
    super('Account not found or no data returned');
    this.name = 'TrongridAccountNotFoundError';
  }
}
