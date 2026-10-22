import type { FetchPolicyError } from '@metamask/snap-networks-utils';
import {
  createFetchPolicyError,
  FetchPolicyErrorName,
  parseRetryAfter,
} from '@metamask/snap-networks-utils';

type AxiosError = Error & {
  code?: string;
  response?: {
    headers?: Record<string, unknown>;
    status?: number;
  };
};

/**
 * Convert fetch and axios-style failures to the shared fetch-policy shape.
 *
 * The policy operation must contain only transport work (fetch, response
 * status and body reads): any other `Error` thrown inside it is classified as
 * a network failure here, and is therefore retried and counted toward circuit
 * breaking. That catch-all is intentional: real `fetch`/axios network
 * failures are not recognisable by name or code across runtimes, so they can
 * only be identified by being the residual case. Keep parsing and validation
 * outside the operation so they propagate unchanged.
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
  if (
    (axiosError as FetchPolicyError).httpStatus !== undefined ||
    error.name === FetchPolicyErrorName.Network ||
    error.name === FetchPolicyErrorName.Timeout
  ) {
    return axiosError;
  }

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

  if (axiosError.code === 'ECONNABORTED') {
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
