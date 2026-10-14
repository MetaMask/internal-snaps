/**
 * Error thrown when an HTTP request to an API fails: the request could not
 * be completed, the API responded with a non-2xx status, or a 2xx response
 * body could not be parsed as JSON.
 *
 * The original error, when there is one, is available as `cause` (e.g. a
 * `TypeError` for a network failure or a `SyntaxError` for an unparseable
 * response body).
 */
export class HttpError extends Error {
  /**
   * Construct a new HTTP error.
   *
   * @param message - The error message, e.g. `'HTTP error! status: 503'`.
   * @param options - Additional error options.
   * @param options.cause - The underlying error that caused the failure, if any.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HttpError';
  }
}
