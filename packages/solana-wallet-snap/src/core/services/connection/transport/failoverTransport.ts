import {
  createFetchPolicyError,
  isTransientError,
} from '@metamask/snap-networks-utils';
import type { FetchPolicyError } from '@metamask/snap-networks-utils';
import type { RpcTransport } from '@solana/kit';

import { toFetchPolicyError } from '../../../utils/fetchPolicy';
import { noOpLogger } from '../../../utils/logger';

const logger = noOpLogger;

/**
 * Normalizes a transport failure for failover, rethrowing immediately when the
 * failure should not fail over to the next endpoint.
 *
 * @param error - The error thrown by the base transport.
 * @param currentUrl - The endpoint URL that failed.
 * @param callerSignal - Optional abort signal supplied by the caller.
 * @param previousRetryAfterMs - `Retry-After` delay from an earlier failed endpoint.
 * @returns A transient {@link FetchPolicyError} annotated with `currentUrl`.
 */
const toFailoverError = (
  error: unknown,
  currentUrl: string | undefined,
  callerSignal: AbortSignal | undefined,
  previousRetryAfterMs: number | undefined,
): FetchPolicyError => {
  if (callerSignal?.aborted) {
    throw callerSignal.reason ?? error;
  }
  if (
    error instanceof SyntaxError ||
    (error as { name?: unknown } | undefined)?.name === 'AbortError'
  ) {
    throw error;
  }
  const baseError = toFetchPolicyError(error);
  const retryAfterMs =
    previousRetryAfterMs !== undefined || baseError.retryAfterMs !== undefined
      ? Math.max(previousRetryAfterMs ?? 0, baseError.retryAfterMs ?? 0)
      : undefined;
  const transportError = Object.assign(
    createFetchPolicyError(baseError.message, {
      name: baseError.name,
      httpStatus: baseError.httpStatus,
      retryAfterMs,
      cause: baseError.cause,
    }),
    { currentUrl },
  );
  if (!isTransientError(transportError)) {
    throw transportError;
  }
  return transportError;
};

/**
 * Creates a failover transport that switches to the next transport on failure.
 * It wraps the provided base transports and adds the failover logic.
 *
 * @param baseTransports - The base transports to use for the failover transport.
 * @param urls - The URLs corresponding to each transport (for error tracking).
 * @returns The failover transport.
 */
export const createFailoverTransport =
  (baseTransports: RpcTransport[], urls: string[]) =>
  async <TResponse>(...args: Parameters<RpcTransport>): Promise<TResponse> => {
    let lastError: FetchPolicyError | undefined;
    const transportCount = baseTransports.length;
    const callerSignal = args[0].signal;
    for (const [index, transport] of baseTransports.entries()) {
      const currentUrl = urls[index];
      try {
        const timeoutSignal = AbortSignal.timeout(10_000);
        logger.info(
          `[🚌 FailoverTransport] Attempting to use transport ${
            index + 1
          } of ${transportCount} (URL: ${currentUrl})`,
        );
        return await transport({
          ...args[0],
          signal: callerSignal
            ? AbortSignal.any([callerSignal, timeoutSignal])
            : timeoutSignal,
        });
      } catch (error) {
        lastError = toFailoverError(
          error,
          currentUrl,
          callerSignal,
          lastError?.retryAfterMs,
        );
        const isLastTransport = index === transportCount - 1;
        logger.error(
          `[🚌 FailoverTransport] Transport failed (URL: ${currentUrl}): ${error}. ${
            isLastTransport
              ? 'No more transports to try.'
              : 'Trying next transport...'
          }`,
        );
      }
    }
    // If all transports fail, throw the last error.
    throw lastError ?? new Error('All Solana RPC transports failed.');
  };
