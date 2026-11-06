import {
  BrokenCircuitError,
  createServicePolicy,
  ExponentialBackoff,
  handleWhen,
} from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/base-data-service';

import type { AnalyticsService } from '../../services/analytics/AnalyticsService';
import type { TrackErrorFn } from '../errors';
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

const ANALYTICS_EVENT_INTERVAL_MS = 60_000;

/**
 * The upstream services allowed in the "Snap Service Degraded" and "Snap
 * Service Unavailable" events. Must match the `service` enum of the Segment
 * schema, which rejects any other value.
 */
export type FetchPolicyService =
  | 'solana_rpc'
  | 'stellar_horizon'
  | 'stellar_rpc'
  | 'esplora'
  | 'trongrid'
  | 'tronweb_provider'
  | 'tronweb_broadcast'
  | 'price_api'
  | 'token_api'
  | 'nft_api'
  | 'security_alerts_api';

/**
 * Why the last attempt of a call that used up its retries failed.
 */
export type FetchPolicyRetryReason =
  | 'connection_failed'
  | 'timed_out'
  | 'non_successful_http_status';

/**
 * The errors the policy has already reported with `trackError`.
 */
const reportedErrors = new WeakSet<Error>();

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

/**
 * Whether an error was already reported by a fetch policy, so a caller that
 * catches it shouldn't report it again. That is an error a policy reported
 * with `trackError` after its retries, or an open-circuit rejection, which the
 * "Snap Service Unavailable" event covers. Errors wrapped with `cause` are
 * recognised too.
 *
 * @param error - The caught error.
 * @returns `true` if the error is already reported.
 */
export const isReportedFetchPolicyError = (error: unknown): boolean => {
  let current = error;
  // Bounded, in case of a `cause` cycle.
  for (let depth = 0; current instanceof Error && depth < 10; depth++) {
    if (current instanceof BrokenCircuitError || reportedErrors.has(current)) {
      return true;
    }
    current = current.cause;
  }
  return false;
};

/**
 * Gets why a retried error failed. Only transient errors are retried, so an
 * error that is neither a network failure nor a timeout has an HTTP status.
 *
 * @param error - The error of the last attempt.
 * @returns The retry reason.
 */
const retryReasonOf = (error: unknown): FetchPolicyRetryReason => {
  const name = (error as Error | undefined)?.name;
  if (name === FetchPolicyErrorName.Network) {
    return 'connection_failed';
  }
  if (name === FetchPolicyErrorName.Timeout) {
    return 'timed_out';
  }
  return 'non_successful_http_status';
};

/**
 * Wraps a function so it runs at most once per {@link ANALYTICS_EVENT_INTERVAL_MS}.
 * Later calls within the interval are dropped.
 *
 * @param fn - The function to wrap.
 * @returns The rate-limited function.
 */
const rateLimited = <Args extends unknown[]>(
  fn: (...args: Args) => void,
): ((...args: Args) => void) => {
  let lastCalledAt = -Infinity;
  return (...args) => {
    const now = Date.now();
    if (now - lastCalledAt < ANALYTICS_EVENT_INTERVAL_MS) {
      return;
    }
    lastCalledAt = now;
    fn(...args);
  };
};

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

/**
 * The analytics events a fetch policy sends.
 */
export type FetchPolicyAnalytics = Pick<
  AnalyticsService,
  'trackServiceDegraded' | 'trackServiceUnavailable'
>;

export type CreateFetchPolicyOptions = Omit<
  CreateServicePolicyOptions,
  'retryFilterPolicy' | 'isServiceFailure'
> & {
  /**
   * The CAIP-2 chain ID the service is called for, if any.
   */
  chainIdCaip?: string;
  /**
   * Where retries, circuit breaks and give-ups are logged.
   */
  logger: Pick<Logger, 'warn'>;
  /**
   * Reports each call that fails after its retries, once, with an error
   * carrying only the service, chain, retry reason, error name and status.
   */
  trackError?: TrackErrorFn;
} & (
    | {
        /**
         * The upstream service the policy protects, e.g. `price_api`. Create
         * one policy per service, so one failing service doesn't open the
         * circuit for the others.
         */
        service: string;
        analytics?: undefined;
      }
    | {
        /**
         * The upstream service the policy protects. With `analytics`, it must
         * be one of the services the Segment schema allows.
         */
        service: FetchPolicyService;
        /**
         * Sends "Snap Service Degraded" and "Snap Service Unavailable", each at
         * most once a minute.
         */
        analytics?: FetchPolicyAnalytics;
      }
  );

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
 * With `analytics`, the policy sends "Snap Service Degraded" when a call is
 * slower than 5 seconds or uses up its retries, and "Snap Service Unavailable"
 * when the circuit opens, each at most once a minute. With `trackError`, it
 * reports each call that uses up its retries. Callers should skip reporting
 * errors for which {@link isReportedFetchPolicyError} returns `true`. Neither
 * ever carries the URL, request or original error message.
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
 * @param options.analytics - Sends the service events, if given.
 * @param options.trackError - Reports calls that use up their retries, if given.
 * @param options.backoff - The base backoff. Defaults to exponential backoff.
 * @returns The policy. Wrap each call with `policy.execute()`.
 */
export const createFetchPolicy = ({
  service,
  chainIdCaip,
  logger,
  analytics,
  trackError,
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
  policy.retryPolicy.onGiveUp((reason) => {
    // Only transient errors are retried, and those are always `Error`s.
    const error = errorOf(reason) as FetchPolicyError;
    logger.warn(`${prefix} Giving up:`, error);
    if (!trackError) {
      return;
    }
    reportedErrors.add(error);
    const { name, httpStatus } = error;
    const details = [name, httpStatus && `HTTP ${httpStatus}`]
      .filter(Boolean)
      .join(', ');
    const tracked = new Error(
      `${prefix} Gave up after retries: ${retryReasonOf(error)} (${details})`,
    );
    tracked.name = 'FetchPolicyGiveUpError';
    trackError(tracked).catch((trackingError: unknown) =>
      logger.warn(`${prefix} Failed to report give-up:`, trackingError),
    );
  });
  policy.onBreak((reason) => {
    const message = `${prefix} Circuit opened for ${policy.circuitBreakDuration} ms`;
    const error = errorOf(reason);
    if (error === undefined) {
      logger.warn(message);
    } else {
      logger.warn(`${message}:`, error);
    }
  });

  if (analytics) {
    const eventProperties = {
      service,
      ...(chainIdCaip === undefined ? {} : { chainIdCaip }),
    };
    const httpStatusOf = (error: unknown): { httpStatus?: number } => {
      const httpStatus = (error as FetchPolicyError | undefined)?.httpStatus;
      return httpStatus === undefined ? {} : { httpStatus };
    };

    const logTrackingFailure = (trackingError: unknown): void =>
      logger.warn(`${prefix} Failed to track service event:`, trackingError);

    policy.onDegraded(
      rateLimited((data) => {
        const { duration } = data as { duration?: number };
        analytics
          .trackServiceDegraded(
            duration === undefined
              ? {
                  ...eventProperties,
                  type: 'retries_exhausted',
                  retryReason: retryReasonOf(errorOf(data)),
                  ...httpStatusOf(errorOf(data)),
                }
              : {
                  ...eventProperties,
                  type: 'slow_success',
                  durationMs: Math.round(duration),
                },
          )
          .catch(logTrackingFailure);
      }),
    );
    policy.onBreak(
      rateLimited((reason) => {
        analytics
          .trackServiceUnavailable({
            ...eventProperties,
            ...httpStatusOf(errorOf(reason)),
          })
          .catch(logTrackingFailure);
      }),
    );
  }

  return policy;
};
