import {
  createFetchPolicy,
  executeWithFetchPolicy,
} from '@metamask/snap-networks-utils';
import type { FetchPolicy, Logger } from '@metamask/snap-networks-utils';
import { providers, TronWeb } from 'tronweb';

import { Network } from '../../constants';
import type { ConfigProvider } from '../../services/config';
import { toFetchPolicyError } from '../../utils/fetchPolicy';
import logger from '../../utils/logger';

const REQUEST_TIMEOUT_MS = 10_000;

export class TronWebFactory {
  readonly #configProvider: ConfigProvider;

  readonly #policies: Map<Network, FetchPolicy>;

  readonly #broadcastPolicies: Map<Network, FetchPolicy>;

  constructor({
    configProvider,
    logger: clientLogger = logger,
  }: {
    configProvider: ConfigProvider;
    logger?: Logger;
  }) {
    this.#configProvider = configProvider;
    this.#policies = new Map(
      Object.values(Network).map((network) => [
        network,
        createFetchPolicy({
          service: 'tronweb_provider',
          chainIdCaip: network,
          logger: clientLogger,
        }),
      ]),
    );
    this.#broadcastPolicies = new Map(
      Object.values(Network).map((network) => [
        network,
        createFetchPolicy({
          service: 'tronweb_broadcast',
          chainIdCaip: network,
          logger: clientLogger,
        }),
      ]),
    );
  }

  /**
   * Execute a read-only TronWeb call through the shared fetch policy.
   *
   * Transaction construction, signing, metadata refresh and broadcasting must
   * not use this method.
   *
   * @param network - The network being queried.
   * @param operation - The read-only TronWeb operation.
   * @returns The operation result.
   */
  async executeRead<Result>(
    network: Network,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    return this.#execute(network, operation);
  }

  /**
   * Rebroadcast an already-signed transaction through the shared fetch policy.
   *
   * The operation must capture one immutable signed transaction. Transaction
   * construction, metadata refresh and signing must happen before this method
   * so every retry has the same transaction ID.
   *
   * @param network - The network being broadcast to.
   * @param operation - A broadcast of an already-signed transaction.
   * @returns The broadcast result.
   */
  async executeBroadcast<Result>(
    network: Network,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const policy = this.#broadcastPolicies.get(network);
    if (!policy) {
      throw new Error(`No broadcast policy configured for network: ${network}`);
    }
    return executeWithFetchPolicy(policy, operation, toFetchPolicyError);
  }

  async #execute<Result>(
    network: Network,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const policy = this.#policies.get(network);
    if (!policy) {
      throw new Error(`No policy configured for network: ${network}`);
    }
    return executeWithFetchPolicy(policy, operation, toFetchPolicyError);
  }

  /**
   * Create a TronWeb client instance for a specific network
   * This creates a fresh instance each time, avoiding state management issues
   *
   * @param network - The network to create the client for
   * @param privateKey - Optional private key to configure the client with
   * @returns TronWeb instance configured for the specified network
   *
   * @example
   * // With private key for signing transactions
   * const tronWeb = factory.createClient(Network.Mainnet, privateKey);
   * const transaction = await tronWeb.transactionBuilder.sendTrx(to, amount);
   * const signedTx = await tronWeb.trx.sign(transaction);
   *
   * // Without private key for read-only operations
   * const tronWeb = factory.createClient(Network.Mainnet);
   * const balance = await tronWeb.trx.getBalance(address);
   */
  createClient(network: Network, privateKey?: string): TronWeb {
    const { baseUrls } = this.#configProvider.config.trongridApi;

    const fullHost = baseUrls[network];
    if (!fullHost) {
      throw new Error(`No configuration found for network: ${network}`);
    }

    const provider = (): InstanceType<typeof providers.HttpProvider> =>
      new providers.HttpProvider(fullHost, REQUEST_TIMEOUT_MS);
    const tronWebConfig = {
      fullNode: provider(),
      solidityNode: provider(),
      eventServer: provider(),
      ...(privateKey && { privateKey }),
    };

    return new TronWeb(tronWebConfig);
  }
}
