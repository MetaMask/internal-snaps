import { createSnapErrorHandling } from '@metamask/snap-networks-utils';
import { UserRejectedRequestError } from '@metamask/snaps-sdk';
import type { Struct } from '@metamask/superstruct';
import { assert, enums, object, type } from '@metamask/superstruct';

import { logger } from './logger';
import { getSnapProvider } from './snap';

export { isSnapRpcError } from '@metamask/snap-networks-utils';
export type { SnapRpcError } from '@metamask/snap-networks-utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- must accept arbitrary `Error` subclass ctor signatures
export type AnyErrorConstructor = abstract new (...args: any[]) => Error;

/**
 * Re-throws `error` when it is an instance of **any** constructor in `exceptionClasses` (subclasses
 * count). Otherwise throws `fallback`. Typical use after logging in an API client `catch` so known
 * domain errors propagate unchanged. Use a one-element array when only one type should match.
 *
 * @param error - Value from a `catch` clause.
 * @param exceptionClasses - `Error` subclass constructors to match with `instanceof`, in order.
 * @param fallback - Error to throw when nothing matches.
 */
export function rethrowIfInstanceElseThrow<Err extends Error>(
  error: unknown,
  exceptionClasses: readonly AnyErrorConstructor[],
  fallback: Err,
): never {
  for (const ExceptionClass of exceptionClasses) {
    if (error instanceof ExceptionClass) {
      throw error;
    }
  }
  throw fallback;
}

export type StellarSnapExceptionOptions = {
  cause?: unknown;
  data?: Record<string, unknown>;
};

/**
 * A custom error class that extends the built-in Error class and adds a `data` property.
 * Instances are serialized by {@link trackError} / `snap_trackError` and forwarded to
 * MetaMask's Sentry pipeline, which applies platform-side scrubbing of sensitive fields.
 */
export class StellarSnapException extends Error {
  readonly data?: Record<string, unknown>;

  constructor(message: string, options?: StellarSnapExceptionOptions) {
    super(message, { cause: options?.cause });
    this.name = new.target.name;
    this.data = options?.data;

    // Explicitly hides this constructor from the stack trace if supported.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/** Network and transport error codes commonly surfaced by `fetch`. */
const COMMON_HTTP_ERROR_CODES = [
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_GET_ISSUER_CERT_LOC',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNRESET',
  'AbortError',
] as const;

type CommonHttpErrorCode = (typeof COMMON_HTTP_ERROR_CODES)[number];

const COMMON_HTTP_ERROR_CODE_SET = new Set<string>(COMMON_HTTP_ERROR_CODES);

const CommonHttpErrorCodesStruct = object({
  cause: type({
    code: enums([...COMMON_HTTP_ERROR_CODES]),
  }),
});

/** Base for HTTP API client errors (transport, request shape, response shape). */
export class ApiException extends StellarSnapException {
  constructor(message: string, options?: StellarSnapExceptionOptions) {
    super(message, options);
    this.name = 'ApiException';
  }
}

/** Network-level HTTP failure (timeout, DNS, TLS, abort, etc.). */
export class HttpException extends ApiException {
  constructor(message: string, options?: StellarSnapExceptionOptions) {
    super(message, options);
    this.name = 'HttpException';
  }
}

/** Non-success HTTP status from a completed response. */
export class HttpResponseException extends HttpException {
  constructor(statusCode: number, options?: StellarSnapExceptionOptions) {
    super(`HTTP error! status: ${statusCode}`, options);
    this.name = 'HttpResponseException';
  }
}

/** Request parameters failed validation before the HTTP call. */
export class InvalidHttpRequestParamsException extends ApiException {
  constructor(message: string, options?: StellarSnapExceptionOptions) {
    super(message, options);
    this.name = 'InvalidHttpRequestParamsException';
  }
}

/** Response body failed validation after a successful HTTP status. */
export class InvalidHttpResponseException extends ApiException {
  constructor(message: string, options?: StellarSnapExceptionOptions) {
    super(message, options);
    this.name = 'InvalidHttpResponseException';
  }
}

/**
 * Validates API request parameters and throws {@link InvalidHttpRequestParamsException} on failure.
 *
 * @param params - Request payload or query parameters to validate.
 * @param struct - Superstruct schema for the validated shape.
 */
export function assertHttpRequestParams<Validated>(
  params: unknown,
  struct: Struct<Validated>,
): asserts params is Validated {
  try {
    assert(params, struct);
  } catch (error) {
    throw new InvalidHttpRequestParamsException(
      'Invalid API request parameters',
      { cause: error },
    );
  }
}

/**
 * Validates an API response body and throws {@link InvalidHttpResponseException} on failure.
 *
 * @param response - Parsed response body to validate.
 * @param struct - Superstruct schema for `response`.
 */
export function assertHttpResponse<Response>(
  response: Response,
  struct: Struct<Response>,
): void {
  try {
    assert(response, struct);
  } catch (error) {
    throw new InvalidHttpResponseException('Invalid API response', {
      cause: error,
    });
  }
}

/**
 * @param error - Value from a `catch` clause.
 * @returns A known HTTP error code from `error.cause.code` or `error.code`.
 */
function getHttpErrorCode(error: Error): CommonHttpErrorCode | undefined {
  if (CommonHttpErrorCodesStruct.is(error)) {
    return error.cause?.code;
  }

  const { code } = error as { code?: string };
  return code !== undefined && COMMON_HTTP_ERROR_CODE_SET.has(code)
    ? (code as CommonHttpErrorCode)
    : undefined;
}

/**
 * Whether `error` represents a transient HTTP transport failure.
 * Used by API clients to decide between fail-fast and partial-result recovery.
 *
 * @param error - Value from a `catch` clause or rejected batch entry.
 * @returns `true` for network, timeout, abort, and non-2xx HTTP status errors.
 */
export function isHttpException(
  error: unknown,
): error is HttpException | (Error & { cause?: { code: string } }) {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error instanceof HttpException) {
    return true;
  }

  if (error.name === 'AbortError') {
    return true;
  }

  return getHttpErrorCode(error) !== undefined;
}

/**
 * Wraps raw transport errors in {@link HttpException}; leaves other values unchanged.
 *
 * @param error - Value from a `catch` clause.
 * @returns `error` when it is already an {@link HttpException}, a new {@link HttpException}
 * when `error` is a recognized transport failure, otherwise `error` unchanged.
 */
export function normalizeHttpException(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error;
  }

  if (error instanceof HttpException) {
    return error;
  }

  if (!isHttpException(error)) {
    return error;
  }

  const code = getHttpErrorCode(error);
  return new HttpException(
    code ? `HTTP error! cause: ${code}` : 'HTTP error!',
    { cause: error },
  );
}

/**
 * @param error - Value from a `catch` clause.
 * @returns Whether `error` is an invalid request/response shape error.
 */
export function isInvalidApiRequestOrResponseException(
  error: unknown,
): error is InvalidHttpRequestParamsException | InvalidHttpResponseException {
  return (
    error instanceof InvalidHttpRequestParamsException ||
    error instanceof InvalidHttpResponseException
  );
}

/**
 * Checks if the error is a {@link StellarSnapException} (including subclasses).
 *
 * @param error - Value from a `catch` clause.
 * @returns Whether `error` is a {@link StellarSnapException} (including subclasses).
 */
export function isStellarSnapException(
  error: unknown,
): error is StellarSnapException {
  return error instanceof StellarSnapException;
}

/**
 * Marks an exception as an expected, transient state (e.g. an account that has
 * not been synchronized yet) rather than a failure: it is still thrown to the
 * caller, but never reported to Sentry through `snap_trackError`.
 */
export type ExpectedStateException = StellarSnapException & {
  readonly isExpectedState: true;
};

/**
 * @param error - Value from a `catch` clause.
 * @returns Whether `error` is an expected state that must not be tracked.
 */
export function isExpectedStateException(
  error: unknown,
): error is ExpectedStateException {
  return (
    error instanceof StellarSnapException &&
    (error as Partial<ExpectedStateException>).isExpectedState === true
  );
}

/**
 * Message of the "balance not synchronized yet" expected state. It is the
 * stable marker of that state: the keyring SDK's `handleKeyringRequest`
 * re-creates every non-`SnapError` as a plain `Error` carrying only the
 * message, so the class and the `isExpectedState` flag are lost before the
 * error reaches the tracking wrapper.
 */
export const BALANCE_NOT_SYNCHRONIZED_MESSAGE =
  'Account balance unavailable: the account has not been synchronized yet';

/**
 * Message of the "stored balance is out of date" expected state: the syncs have been failing
 * since the last successful one, longer than the stale threshold. Stable marker for the same
 * reason as {@link BALANCE_NOT_SYNCHRONIZED_MESSAGE}.
 */
export const BALANCE_STALE_MESSAGE =
  'Account balance unavailable: synchronization has been failing since the last successful sync';

const EXPECTED_STATE_MESSAGES = [
  BALANCE_NOT_SYNCHRONIZED_MESSAGE,
  BALANCE_STALE_MESSAGE,
];

const hasExpectedStateMessage = (text: string): boolean =>
  EXPECTED_STATE_MESSAGES.some((marker) => text.includes(marker));

/**
 * Whether an error is an expected state, even after it was re-created,
 * wrapped or serialized along the way: matches the class flag, then the
 * stable message marker on the error, its `cause` chain or a serialized error.
 *
 * @param error - Value from a `catch` clause.
 * @returns Whether `error` is (or wraps) an expected state.
 */
export function isExpectedStateError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (isExpectedStateException(current)) {
      return true;
    }
    if (typeof current === 'string') {
      return hasExpectedStateMessage(current);
    }
    if (typeof current !== 'object') {
      return false;
    }
    const { message, cause } = current as {
      message?: unknown;
      cause?: unknown;
    };
    if (typeof message === 'string' && hasExpectedStateMessage(message)) {
      return true;
    }
    current = cause;
  }
  return false;
}

/**
 * Tracking filter: skips user rejections (the default) and expected states.
 *
 * @param error - Value from a `catch` clause.
 * @returns Whether the error should be reported through `snap_trackError`.
 */
export function shouldTrackError(error: unknown): boolean {
  return (
    !(error instanceof UserRejectedRequestError) && !isExpectedStateError(error)
  );
}

export const { trackError, withCatchAndThrowSnapError } =
  createSnapErrorHandling({
    getSnapProvider,
    logError: logger.error.bind(logger),
    shouldTrack: shouldTrackError,
  });
