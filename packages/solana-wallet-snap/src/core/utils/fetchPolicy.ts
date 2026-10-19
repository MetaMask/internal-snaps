import type { FetchPolicyError } from '@metamask/snap-networks-utils';
import {
  createFetchPolicyError,
  FetchPolicyErrorName,
  parseRetryAfter,
} from '@metamask/snap-networks-utils';

export type { FetchPolicy } from '@metamask/snap-networks-utils';

type TransportError = Error & {
  context?: {
    headers?: Headers;
    statusCode?: number;
  };
  response?: {
    headers?: Record<string, unknown>;
    status?: number;
  };
};

/**
 * Convert errors thrown at a Solana transport-only boundary to the shared
 * fetch-policy shape.
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

  const transportError = error as TransportError;
  if (
    (transportError as FetchPolicyError).httpStatus !== undefined ||
    error.name === FetchPolicyErrorName.Network ||
    error.name === FetchPolicyErrorName.Timeout
  ) {
    return transportError;
  }
  const httpStatus =
    transportError.context?.statusCode ?? transportError.response?.status;
  if (httpStatus !== undefined) {
    const retryAfter =
      transportError.context?.headers?.get('Retry-After') ??
      transportError.response?.headers?.['retry-after'];
    return createFetchPolicyError(error.message, {
      httpStatus,
      retryAfterMs: parseRetryAfter(retryAfter),
      cause: error,
    });
  }

  if (error.name === FetchPolicyErrorName.Timeout) {
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
