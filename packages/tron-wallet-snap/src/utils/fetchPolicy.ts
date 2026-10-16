import {
  createFetchPolicyError,
  FetchPolicyErrorName,
} from '@metamask/snap-networks-utils';
import type { FetchPolicyError } from '@metamask/snap-networks-utils';

export type FetchPolicy = {
  execute<Result>(operation: () => Promise<Result>): Promise<Result>;
};

type AxiosError = Error & {
  code?: string;
  response?: {
    headers?: Record<string, unknown>;
    status?: number;
  };
};

/**
 * Parse a Retry-After header as milliseconds.
 *
 * @param value - The header value.
 * @returns The delay in milliseconds, if valid.
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
 * Convert fetch and axios-style failures to the shared fetch-policy shape.
 *
 * @param error - The upstream error.
 * @returns The error in the shared shape.
 */
export const toFetchPolicyError = (error: unknown): FetchPolicyError => {
  if (!(error instanceof Error)) {
    return createFetchPolicyError('Network request failed', {
      name: FetchPolicyErrorName.Network,
      cause: error,
    });
  }

  const axiosError = error as AxiosError;
  const httpStatus = axiosError.response?.status;
  if (httpStatus !== undefined) {
    return createFetchPolicyError(error.message, {
      httpStatus,
      retryAfterMs: parseRetryAfter(
        axiosError.response?.headers?.['retry-after'],
      ),
      cause: error,
    });
  }

  if (
    error.name === FetchPolicyErrorName.Timeout ||
    axiosError.code === 'ECONNABORTED'
  ) {
    return createFetchPolicyError(error.message, {
      name: FetchPolicyErrorName.Timeout,
      cause: error,
    });
  }

  return createFetchPolicyError(error.message, {
    name: FetchPolicyErrorName.Network,
    cause: error,
  });
};

/**
 * Execute a network operation through a policy, mapping transport failures.
 *
 * @param policy - The shared fetch policy.
 * @param operation - The network operation.
 * @returns The operation result.
 */
export const executeWithFetchPolicy = async <Result>(
  policy: FetchPolicy,
  operation: () => Promise<Result>,
): Promise<Result> =>
  policy.execute(async () => {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof Error &&
        ((error as FetchPolicyError).httpStatus !== undefined ||
          error.name === FetchPolicyErrorName.Network ||
          error.name === FetchPolicyErrorName.Timeout)
      ) {
        throw error;
      }
      throw toFetchPolicyError(error);
    }
  });
