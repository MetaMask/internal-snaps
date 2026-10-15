import {
  createServicePolicy,
  ExponentialBackoff,
  handleWhen,
} from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/base-data-service';

import type { Logger } from '../logger/Logger';

/**
 * The error `policy.execute()` throws while the circuit is open. Its `name` is
 * `Error`, so check for it with `instanceof`.
 */
export { BrokenCircuitError } from '@metamask/base-data-service';

/**
 * The error shape the fetch policy decides on. Each snap converts its errors
 * to this shape at the network boundary.
 *
 * - `httpStatus` is set only when a non-2xx response arrived.
 * - Network failures and timeouts have no `httpStatus`; they are identified by
 * their `name` (see {@link FetchPolicyErrorName}).
 * - `retryAfterMs` is the parsed `Retry-After` header, when there is one.
 */
export type FetchPolicyError = Error & {
  httpStatus?: number;
  retryAfterMs?: number;
};

/**
 * The error names the fetch policy treats as transient. `TimeoutError` is also
 * the name of the error thrown by `AbortSignal.timeout()`.
 */
export const FetchPolicyErrorName = {
  Network: 'NetworkError',
  Timeout: 'TimeoutError',
} as const;

/**
 * The longest `Retry-After` the policy waits for. A longer one fails the call
 * at once rather than blocking the user.
 */
export const MAX_RETRY_AFTER_MS = 30_000;

const DEFAULT_CIRCUIT_BREAK_DURATION_MS = 30_000;

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Creates an error in the shape the fetch policy decides on.
 *
 * @param message - The error message.
 * @param options - The error fields. Omitted fields are not set.
 * @param options.name - The error name, e.g. `FetchPolicyErrorName.Network`.
 * @param options.httpStatus - The HTTP status of a non-2xx response.
 * @param options.retryAfterMs - The parsed `Retry-After` header, in milliseconds.
 * @param options.cause - The original error.
 * @returns The error.
 */
export const createFetchPolicyError = (
  message: string,
  {
    name,
    httpStatus,
    retryAfterMs,
    cause,
  }: {
    name?: string;
    httpStatus?: number;
    retryAfterMs?: number;
    cause?: unknown;
  } = {},
): FetchPolicyError => {
  const error: FetchPolicyError = new Error(
    message,
    cause === undefined ? undefined : { cause },
  );
  if (name !== undefined) {
    error.name = name;
  }
  if (httpStatus !== undefined) {
    error.httpStatus = httpStatus;
  }
  if (retryAfterMs !== undefined) {
    error.retryAfterMs = retryAfterMs;
  }
  return error;
};

/**
 * Whether an error is a transient failure: a network failure, a timeout, or
 * HTTP 408, 425, 429, 500, 502, 503 or 504.
 *
 * @param error - The error to check.
 * @returns `true` if the error is transient.
 */
export const isTransientError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const { name, httpStatus } = error as FetchPolicyError;
  return (
    name === FetchPolicyErrorName.Network ||
    name === FetchPolicyErrorName.Timeout ||
    (httpStatus !== undefined && RETRYABLE_HTTP_STATUSES.has(httpStatus))
  );
};

const isServiceFailure = (error: unknown): boolean =>
  isTransientError(error) ||
  ((error as FetchPolicyError | undefined)?.httpStatus ?? 0) >= 500;

type Backoff = NonNullable<CreateServicePolicyOptions['backoff']>;

/**
 * Gets the error of a failed attempt, if it threw one.
 *
 * @param reason - The failure reason from the policy (`{ error }` or `{ value }`).
 * @returns The error, or `undefined` if the attempt didn't throw.
 */
const errorOf = (reason: unknown): unknown =>
  (reason as { error?: unknown }).error;

/**
 * Wraps a backoff so each delay is at least the failed attempt's
 * `retryAfterMs`.
 *
 * @param inner - The backoff to wrap.
 * @returns The wrapped backoff.
 */
const withRetryAfter = (inner: Backoff): Backoff => ({
  next(context): ReturnType<Backoff['next']> {
    const step = inner.next(context);
    const error = errorOf((context as { result: unknown }).result) as
      | FetchPolicyError
      | undefined;
    const retryAfter = error?.retryAfterMs;
    const retryAfterMs =
      typeof retryAfter === 'number' &&
      Number.isFinite(retryAfter) &&
      retryAfter >= 0
        ? retryAfter
        : 0;
    return {
      ...withRetryAfter(step),
      duration: Math.max(step.duration, retryAfterMs),
    };
  },
});

export type CreateFetchPolicyOptions = Omit<
  CreateServicePolicyOptions,
  'retryFilterPolicy' | 'isServiceFailure'
> & {
  /**
   * The upstream service the policy protects, e.g. `price_api`. Create one
   * policy per service, so one failing service doesn't open the circuit for
   * the others.
   */
  service: string;
  /**
   * The CAIP-2 chain ID the service is called for, if any.
   */
  chainIdCaip?: string;
  /**
   * Where retries, circuit breaks and give-ups are logged.
   */
  logger: Pick<Logger, 'warn'>;
};

/**
 * Creates a retry and circuit-breaker policy for calls to one upstream
 * service, on top of `createServicePolicy` from `@metamask/base-data-service`.
 *
 * - Retries only transient errors (see {@link isTransientError}), up to 3 times
 * by default, with exponential backoff and jitter.
 * - Waits for the error's `retryAfterMs` when it is longer than the backoff, and
 * doesn't retry when it is over {@link MAX_RETRY_AFTER_MS}.
 * - Counts transient errors and any 5xx toward opening the circuit, which then
 * stays open for 30 seconds by default. Other errors, such as 4xx, aborts and
 * validation errors, don't count.
 *
 * The circuit state lives in memory, and a snap is stopped after about 30
 * seconds idle, so the circuit only protects within a burst of requests.
 *
 * Snaps must provide a `performance` global (see `performance-shim`), which
 * the underlying library uses to time calls.
 *
 * Create one policy per upstream service, convert errors to
 * {@link FetchPolicyError} at the network boundary, and wrap each call with
 * `policy.execute()`:
 *
 * @example
 * ```typescript
 * const priceApiPolicy = createFetchPolicy({ service: 'price_api', logger });
 *
 * const prices = await priceApiPolicy.execute(async () => {
 *   const response = await fetch(url, {
 *     signal: AbortSignal.timeout(10_000),
 *   });
 *   if (!response.ok) {
 *     throw createFetchPolicyError(`HTTP ${response.status}`, {
 *       httpStatus: response.status,
 *     });
 *   }
 *   return response.json();
 * });
 * ```
 *
 * Don't wrap calls that build, sign and send a transaction: a retry could send
 * it twice.
 *
 * While the circuit is open, `policy.execute()` throws
 * {@link BrokenCircuitError} without calling the service. Its `name` is
 * `Error`, so check for it with `instanceof`.
 *
 * The underlying library times calls with `performance.now()`, which snaps
 * don't have. Add `webpack` as a dev dependency, on the same major version as
 * `@metamask/snaps-cli`, and provide the shim in `snap.config.ts`:
 *
 * @example
 * ```typescript
 * import type { SnapConfig } from '@metamask/snaps-cli';
 * import { merge } from '@metamask/snaps-cli';
 * import { ProvidePlugin } from 'webpack';
 *
 * const config: SnapConfig = {
 *   // ...
 *   customizeWebpackConfig: (webpackConfig) =>
 *     merge(webpackConfig, {
 *       plugins: [
 *         new ProvidePlugin({
 *           performance: '@metamask/snap-networks-utils/performance-shim',
 *         }),
 *       ],
 *     }),
 * };
 * ```
 *
 * @param options - The policy options.
 * @param options.service - The upstream service name.
 * @param options.chainIdCaip - The CAIP-2 chain ID, if any.
 * @param options.logger - The logger.
 * @param options.backoff - The base backoff. Defaults to exponential backoff.
 * @returns The policy. Wrap each call with `policy.execute()`.
 */
export const createFetchPolicy = ({
  service,
  chainIdCaip,
  logger,
  backoff = new ExponentialBackoff(),
  ...options
}: CreateFetchPolicyOptions): ServicePolicy => {
  const prefix = `[${[service, chainIdCaip].filter(Boolean).join(' ')}]`;

  const isRetryable = (error: FetchPolicyError): boolean => {
    if (!isTransientError(error)) {
      return false;
    }
    const retryAfterMs = error.retryAfterMs ?? 0;
    if (retryAfterMs > MAX_RETRY_AFTER_MS) {
      logger.warn(
        `${prefix} Not retrying: Retry-After of ${retryAfterMs} ms is over the ${MAX_RETRY_AFTER_MS} ms cap:`,
        error,
      );
      return false;
    }
    return true;
  };

  const policy = createServicePolicy({
    circuitBreakDuration: DEFAULT_CIRCUIT_BREAK_DURATION_MS,
    ...options,
    backoff: withRetryAfter(backoff),
    retryFilterPolicy: handleWhen(isRetryable),
    isServiceFailure,
  });

  policy.onRetry(({ attempt, delay, ...reason }) =>
    logger.warn(
      `${prefix} Retrying (attempt ${attempt}, delay ${delay} ms):`,
      errorOf(reason),
    ),
  );
  policy.retryPolicy.onGiveUp((reason) =>
    logger.warn(`${prefix} Giving up:`, errorOf(reason)),
  );
  policy.onBreak((reason) => {
    const message = `${prefix} Circuit opened for ${policy.circuitBreakDuration} ms`;
    const error = errorOf(reason);
    if (error === undefined) {
      logger.warn(message);
    } else {
      logger.warn(`${message}:`, error);
    }
  });

  return policy;
};
