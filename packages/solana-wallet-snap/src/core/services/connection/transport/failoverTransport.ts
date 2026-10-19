import {
  createFetchPolicyError,
  isTransientError,
} from '@metamask/snap-networks-utils';
import type { RpcTransport } from '@solana/kit';

import { toFetchPolicyError } from '../../../utils/fetchPolicy';
import { noOpLogger } from '../../../utils/logger';

const logger = noOpLogger;

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
    let lastError;
    const transportCount = baseTransports.length;
    for (const [index, transport] of baseTransports.entries()) {
      try {
        const currentUrl = urls[index];
        const callerSignal = args[0].signal;
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
        const currentUrl = urls[index];
        const callerSignal = args[0].signal;
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
          lastError?.retryAfterMs !== undefined ||
          baseError.retryAfterMs !== undefined
            ? Math.max(
                lastError?.retryAfterMs ?? 0,
                baseError.retryAfterMs ?? 0,
              )
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
        lastError = transportError;
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
    throw lastError instanceof Error
      ? lastError
      : new Error('All Solana RPC transports failed.');
  };
