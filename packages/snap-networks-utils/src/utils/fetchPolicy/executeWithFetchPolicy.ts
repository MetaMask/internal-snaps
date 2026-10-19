import type { ServicePolicy } from '@metamask/base-data-service';

import type { FetchPolicyError } from './createFetchPolicy';
import {
  createFetchPolicyError,
  FetchPolicyErrorName,
} from './createFetchPolicy';

/**
 * The minimal policy surface `executeWithFetchPolicy` and `fetchWithPolicy`
 * accept: the `execute` method of a policy created by
 * {@link createFetchPolicy}.
 */
export type FetchPolicy = Pick<ServicePolicy, 'execute'>;

/**
 * The default timeout for a `fetchWithPolicy` request, in milliseconds.
 */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Parse a `Retry-After` header value as milliseconds.
 *
 * @param value - The header value: a delay in seconds or an HTTP date.
 * @returns The delay in milliseconds, or `undefined` if the value is invalid.
 */
export const parseRetryAfter = (value: unknown): number | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
};

/**
 * Convert an unrecognized error to a network failure.
 *
 * @param error - The upstream error.
 * @returns The error in the policy shape.
 */
const toNetworkError = (error: unknown): FetchPolicyError =>
  error instanceof Error
    ? createFetchPolicyError(error.message, {
        name: FetchPolicyErrorName.Network,
        cause: error,
      })
    : createFetchPolicyError('Network request failed', {
        name: FetchPolicyErrorName.Network,
        cause: error,
      });

const createAbortError = (): Error =>
  Object.assign(new Error('The operation was aborted.'), {
    name: 'AbortError',
  });

/**
 * Race a promise against an abort signal so caller cancellation interrupts
 * retry backoff waits without waiting for the timer to expire.
 *
 * @param promise - The operation promise.
 * @param signal - Optional abort signal from the caller.
 * @returns The operation result, or rejects with the abort reason.
 */
const raceWithSignal = async <Result>(
  promise: Promise<Result>,
  signal: AbortSignal | undefined,
): Promise<Result> => {
  if (!signal) {
    return promise;
  }
  let onAbort!: () => void;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    onAbort = (): void => {
      reject(createAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  // Suppress unhandled rejection if `promise` settles after `abortPromise` wins.
  promise.catch(() => undefined);
  try {
    return await Promise.race([promise, abortPromise]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};

/**
 * Execute a transport-only operation through a fetch policy, mapping errors to
 * the shape the policy decides on.
 *
 * The operation must contain only transport work: a fetch, a status check and
 * a body read. Parsing and validation belong outside it, so their errors
 * propagate unchanged instead of being counted as failures.
 *
 * - `SyntaxError` and abort errors pass through unchanged: the policy must not
 * retry or count them.
 * - Errors already in the policy shape (with an `httpStatus`, or a network or
 * timeout name) pass through unchanged.
 * - Any other error is mapped with `mapError`, which defaults to treating it
 * as a network failure. The catch-all is intentional: real `fetch` network
 * failures are not recognisable by name or code across runtimes, so they can
 * only be identified by being the residual case.
 *
 * @param policy - The shared fetch policy.
 * @param operation - The transport operation.
 * @param mapError - An optional mapper for unrecognized errors. Use it to
 * extract statuses from protocol-specific error shapes (e.g. axios responses
 * or Solana transport errors).
 * @param signal - Optional caller abort signal. When aborted, skips or
 * interrupts retry backoff immediately without another transport invocation.
 * @returns The operation result.
 */
export const executeWithFetchPolicy = async <Result>(
  policy: FetchPolicy,
  operation: () => Promise<Result>,
  mapError: (error: unknown) => FetchPolicyError = toNetworkError,
  signal?: AbortSignal | null,
): Promise<Result> => {
  if (signal?.aborted) {
    throw signal.reason ?? createAbortError();
  }
  try {
    return await raceWithSignal(
      policy.execute(async () => {
        if (signal?.aborted) {
          throw createAbortError();
        }
        try {
          return await operation();
        } catch (error) {
          if (signal?.aborted) {
            throw createAbortError();
          }
          if (
            error instanceof SyntaxError ||
            (error as { name?: unknown } | undefined)?.name === 'AbortError'
          ) {
            throw error;
          }
          if (
            error instanceof Error &&
            ((error as FetchPolicyError).httpStatus !== undefined ||
              error.name === FetchPolicyErrorName.Network ||
              error.name === FetchPolicyErrorName.Timeout)
          ) {
            throw error;
          }
          throw mapError(error);
        }
      }, signal ?? undefined),
      signal ?? undefined,
    );
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason ?? error;
    }
    throw error;
  }
};

/**
 * Fetch a URL through a fetch policy, throwing a {@link FetchPolicyError} on a
 * non-2xx response and returning the body as text.
 *
 * This is the common shape of every policy-wrapped HTTP call in the snaps: a
 * fetch with a timeout, a status check that turns a non-2xx response into a
 * policy error (honouring `Retry-After`), and a body read inside the policy so
 * a truncated response is retried too.
 *
 * @param policy - The shared fetch policy.
 * @param url - The URL to fetch.
 * @param init - Optional fetch options. A caller-provided `signal` replaces
 * the default timeout signal.
 * @param fetchImpl - The fetch implementation, defaulting to `globalThis.fetch`.
 * @returns The response body as text.
 */
export const fetchWithPolicy = async (
  policy: FetchPolicy,
  url: string,
  init?: RequestInit,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<string> => {
  const callerSignal = init?.signal;
  return executeWithFetchPolicy(
    policy,
    async () => {
      const response = await fetchImpl(url, {
        ...init,
        signal: callerSignal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw createFetchPolicyError(`HTTP error! status: ${response.status}`, {
          httpStatus: response.status,
          retryAfterMs: parseRetryAfter(response.headers?.get('Retry-After')),
        });
      }
      return response.text();
    },
    toNetworkError,
    callerSignal,
  );
};
