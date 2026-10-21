import { createFetchPolicy } from '@metamask/snap-networks-utils';
import type { Logger } from '@metamask/snap-networks-utils';
import { pipe } from '@solana/kit';
import type { RpcTransport } from '@solana/kit';

import type { Network } from '../../../constants/solana';
import { createToggleInfuraBigtableLookupsTransport } from './createToggleInfuraBigtableLookupsTransports';
import { createErrorTrackingTransport } from './errorTrackingTransport';
import { createFailoverTransport } from './failoverTransport';
import { createPolicyTransport } from './policyTransport';

/**
 * A functional programming utility to iterate over an array and apply a function to each item.
 *
 * @param callback - The function to apply to each item.
 * @returns An array of the results of applying the function to each item.
 */
const forEach =
  <TItem, TResult>(callback: (item: TItem) => TResult) =>
  (items: TItem[]): TResult[] =>
    items.map(callback);

/**
 * Creates the main transport for RPC calls, stacking up multiple behaviors:
 *
 * - Error Tracking: Tracks all RPC errors (4xx, 5xx, and 2xx with errors) using snap_trackError.
 * - BigTable Lookups: Toggles BigTable lookups on Infura via the `x-bigtable` header.
 * - Failover: Switches to the next transport on failure.
 * - Policy: Retries transient read failures; writes and unknown methods are
 * sent once to the first endpoint.
 *
 * @param urls - The URL to use for the transport.
 * @param chainIdCaip - The CAIP-2 chain ID used to isolate circuit state.
 * @param logger - Where policy activity is logged.
 * @returns The transport.
 */
export const createMainTransport = (
  urls: string[],
  chainIdCaip: Network,
  logger: Logger,
): RpcTransport => {
  const transports = pipe(
    urls,
    forEach(createToggleInfuraBigtableLookupsTransport),
  );
  const oneShotTransport = transports[0];
  if (!oneShotTransport) {
    throw new Error('At least one Solana RPC URL is required.');
  }
  const transport = createPolicyTransport({
    readTransport: createFailoverTransport(transports, urls),
    oneShotTransport,
    policy: createFetchPolicy({
      service: 'solana_rpc',
      chainIdCaip,
      logger,
    }),
  });
  return createErrorTrackingTransport(transport);
};
