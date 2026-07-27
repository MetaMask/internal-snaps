/**
 * Error thrown when a TronGrid HTTP request fails with a non-2xx status.
 * Carries the HTTP status code so callers can react to rate-limiting (429)
 * distinctly from other failures.
 */
export class TrongridHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HTTP error! status: ${status}`);
    this.name = 'TrongridHttpError';
    this.status = status;
  }
}

/**
 * Specialization of {@link TrongridHttpError} for HTTP 429 (Too Many Requests).
 */
export class TrongridRateLimitError extends TrongridHttpError {
  constructor() {
    super(429);
    this.name = 'TrongridRateLimitError';
  }
}

/**
 * Minimal shape of a `fetch` response needed to build a typed HTTP error. The
 * SES snap environment restricts the global `Response` type, so only the
 * field consumed here is declared.
 */
type FetchErrorResponse = {
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
  if (response.status === 429) {
    return new TrongridRateLimitError();
  }

  return new TrongridHttpError(response.status);
};

export class TrongridAccountNotFoundError extends Error {
  constructor() {
    super('Account not found or no data returned');
    this.name = 'TrongridAccountNotFoundError';
  }
}
