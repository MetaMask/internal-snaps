import {
  createFetchPolicyError,
  FetchPolicyErrorName,
} from '@metamask/snap-networks-utils';

export const DUP_TRANSACTION_ERROR = 5;

const TRANSIENT_BROADCAST_CODES = new Set<unknown>([
  9,
  10,
  11,
  'SERVER_BUSY',
  'NO_CONNECTION',
  'NOT_ENOUGH_EFFECTIVE_CONNECTION',
]);

type BroadcastResult = {
  code?: unknown;
  message?: unknown;
  result: boolean;
};

/**
 * Convert a resolved transient node response into an error the fetch policy
 * can retry.
 *
 * @param result - The TronGrid broadcast result.
 * @returns The unchanged result when it is not transient.
 */
export const throwOnTransientBroadcastFailure = <
  Result extends BroadcastResult,
>(
  result: Result,
): Result => {
  if (!result.result && TRANSIENT_BROADCAST_CODES.has(result.code)) {
    throw createFetchPolicyError(
      typeof result.message === 'string'
        ? result.message
        : `Transient broadcast failure: ${String(result.code)}`,
      { name: FetchPolicyErrorName.Network },
    );
  }
  return result;
};

/**
 * Whether a transaction broadcast succeeded or was already accepted.
 *
 * @param result - The TronGrid broadcast result.
 * @param result.code - The TronGrid response code.
 * @param result.result - Whether the broadcast succeeded.
 * @returns Whether callers should treat the broadcast as successful.
 */
export const isSuccessfulBroadcast = (result: BroadcastResult): boolean =>
  result.result ||
  result.code === DUP_TRANSACTION_ERROR ||
  result.code === 'DUP_TRANSACTION_ERROR';
