import { executeWithFetchPolicy } from '@metamask/snap-networks-utils';
import type { FetchPolicy } from '@metamask/snap-networks-utils';
import type { RpcTransport } from '@solana/kit';

import { toFetchPolicyError } from '../../../utils/fetchPolicy';

const RETRYABLE_RPC_METHODS = new Set([
  'getAccountInfo',
  'getBalance',
  'getGenesisHash',
  'getLatestBlockhash',
  'getMinimumBalanceForRentExemption',
  'getMultipleAccounts',
  'getSignatureStatuses',
  'getSignaturesForAddress',
  'getSlot',
  'getTokenAccountsByOwner',
  'getTokenLargestAccounts',
  'getTransaction',
  'isBlockhashValid',
  'simulateTransaction',
]);

/**
 * Route known read-only RPC methods through the shared fetch policy. Writes and
 * unknown methods are sent once to avoid retrying a future state-changing RPC.
 *
 * @param options - Transport options.
 * @param options.readTransport - Read transport with endpoint failover.
 * @param options.oneShotTransport - First endpoint transport used for writes.
 * @param options.policy - Shared fetch policy for reads.
 * @returns A method-aware RPC transport.
 */
export const createPolicyTransport =
  ({
    readTransport,
    oneShotTransport,
    policy,
  }: {
    readTransport: RpcTransport;
    oneShotTransport: RpcTransport;
    policy: FetchPolicy;
  }): RpcTransport =>
  async <Response>(...args: Parameters<RpcTransport>): Promise<Response> => {
    const { method } = args[0].payload as { method?: unknown };
    if (typeof method === 'string' && RETRYABLE_RPC_METHODS.has(method)) {
      const callerSignal = args[0].signal;
      return executeWithFetchPolicy(
        policy,
        async () => readTransport(...args),
        toFetchPolicyError,
        callerSignal,
      );
    }
    return oneShotTransport(...args);
  };
