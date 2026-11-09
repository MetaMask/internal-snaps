import type {
  FeeEstimates,
  Network,
  Transaction,
} from '@metamask/bitcoindevkit';
import { EsploraClient } from '@metamask/bitcoindevkit';
import {
  createFetchPolicy,
  createFetchPolicyError,
  executeWithFetchPolicy,
  FetchPolicyErrorName,
  fetchWithPolicy,
} from '@metamask/snap-networks-utils';
import type {
  FetchPolicy,
  FetchPolicyError,
  Logger,
} from '@metamask/snap-networks-utils';

import { ExternalServiceError } from '../entities';
import type {
  BitcoinAccount,
  ChainConfig,
  BlockchainClient,
} from '../entities';

/**
 * Minimal subset of the Esplora/Blockstream REST `/tx/:txid` response needed to
 * resolve the addresses that funded a transaction. Each input carries a
 * `prevout` describing the output it spends, including the address that
 * received it, which the WASM client does not surface.
 */
type EsploraTxVin = {
  /* eslint-disable @typescript-eslint/naming-convention -- Mirrors the Esplora REST API response. */
  prevout?: {
    scriptpubkey_address?: string;
  } | null;
  /* eslint-enable @typescript-eslint/naming-convention */
};

type EsploraTx = {
  vin: EsploraTxVin[];
};

/**
 * Strips trailing slashes and mempool.space's `/v1` API prefix so the raw
 * Esplora REST paths (`/tx/:txid`, `/blocks/tip/height`, ...) can be appended.
 * The WASM client accepts the `/v1` base for some of its own endpoints, but the
 * transaction endpoint lives at the root.
 *
 * @param url - Configured Esplora base URL.
 * @returns The base URL without a trailing slash or `/v1` suffix.
 */
function toEsploraRestUrl(url: string): string {
  return url.replace(/\/+$/u, '').replace(/\/v1$/u, '');
}

const ALREADY_BROADCAST_PATTERN =
  /already in block\s*chain|already in mempool|txn-already-(?:in-mempool|known)/iu;

/**
 * Whether an Esplora broadcast error indicates the transaction is already in
 * the mempool or blockchain.
 *
 * @param error - The error thrown by the BDK WASM client.
 * @returns `true` if the node already knows the transaction.
 */
function isAlreadyBroadcastError(error: unknown): boolean {
  return (
    error instanceof Error && ALREADY_BROADCAST_PATTERN.test(error.message)
  );
}

/**
 * Converts errors exposed by the BDK WASM Esplora client to the shared policy
 * shape. The WASM boundary preserves Rust's display strings but not its error
 * variants, so only explicit HTTP and reqwest failures are treated as
 * transport errors. Parsing, wallet, and request-construction errors pass
 * through and are not retried.
 *
 * @param error - The error thrown by the BDK WASM client.
 * @returns The error in the shared policy shape.
 */
function toFetchPolicyError(error: unknown): FetchPolicyError {
  if (!(error instanceof Error)) {
    return createFetchPolicyError('Esplora request failed', { cause: error });
  }

  const httpStatus = /HttpResponse \{ status: (?<status>\d+),/u.exec(
    error.message,
  )?.groups?.status;
  if (httpStatus !== undefined) {
    return createFetchPolicyError(error.message, {
      httpStatus: Number(httpStatus),
      cause: error,
    });
  }

  if (
    error.message.startsWith('Reqwest(') &&
    !/\bkind: Decode\b/u.test(error.message)
  ) {
    return createFetchPolicyError(error.message, {
      name: FetchPolicyErrorName.Network,
      cause: error,
    });
  }

  return error;
}

export class EsploraClientAdapter implements BlockchainClient {
  // Should be a Repository but we don't support custom networks so we can save in memory from config values
  readonly #clients: Record<Network, EsploraClient>;

  readonly #config: ChainConfig;

  readonly #restUrls: Record<Network, string>;

  readonly #policies: Record<Network, FetchPolicy>;

  // Funding addresses are resolved while mapping transactions, which runs on
  // every sync/event emission. Cache by network + txid so a receive is only
  // looked up once instead of on each notification.
  readonly #sendersCache = new Map<string, Promise<string[]>>();

  constructor(config: ChainConfig, logger: Logger) {
    this.#clients = {
      bitcoin: new EsploraClient(config.url.bitcoin, 0),
      testnet: new EsploraClient(config.url.testnet, 0),
      testnet4: new EsploraClient(config.url.testnet4, 0),
      signet: new EsploraClient(config.url.signet, 0),
      regtest: new EsploraClient(config.url.regtest, 0),
    };

    this.#restUrls = {
      bitcoin: toEsploraRestUrl(config.url.bitcoin),
      testnet: toEsploraRestUrl(config.url.testnet),
      testnet4: toEsploraRestUrl(config.url.testnet4),
      signet: toEsploraRestUrl(config.url.signet),
      regtest: toEsploraRestUrl(config.url.regtest),
    };

    this.#policies = {
      bitcoin: createFetchPolicy({ service: 'esplora_bitcoin', logger }),
      testnet: createFetchPolicy({ service: 'esplora_testnet', logger }),
      testnet4: createFetchPolicy({ service: 'esplora_testnet4', logger }),
      signet: createFetchPolicy({ service: 'esplora_signet', logger }),
      regtest: createFetchPolicy({ service: 'esplora_regtest', logger }),
    };

    this.#config = config;
  }

  async fullScan(
    account: BitcoinAccount,
    mode: 'discovery' | 'scan' = 'scan',
  ): Promise<void> {
    try {
      const stopGap =
        mode === 'discovery'
          ? this.#config.stopGap.discovery
          : this.#config.stopGap.scan;
      const update = await executeWithFetchPolicy(
        this.#policies[account.network],
        async () =>
          this.#clients[account.network].full_scan(
            account.startFullScan(),
            stopGap,
            this.#config.parallelRequests,
          ),
        toFetchPolicyError,
      );
      account.applyUpdate(update);
    } catch (error) {
      throw new ExternalServiceError(
        `Failed to perform initial full scan`,
        { account: account.id },
        error,
      );
    }
  }

  async sync(account: BitcoinAccount): Promise<void> {
    try {
      const update = await executeWithFetchPolicy(
        this.#policies[account.network],
        async () =>
          this.#clients[account.network].sync(
            account.startSync(),
            this.#config.parallelRequests,
          ),
        toFetchPolicyError,
      );
      account.applyUpdate(update);
    } catch (error) {
      throw new ExternalServiceError(
        `Failed to synchronize account`,
        { account: account.id },
        error,
      );
    }
  }

  async broadcast(network: Network, transaction: Transaction): Promise<void> {
    try {
      await executeWithFetchPolicy(
        this.#policies[network],
        async () => {
          try {
            await this.#clients[network].broadcast(transaction);
          } catch (error) {
            if (isAlreadyBroadcastError(error)) {
              return;
            }
            throw error;
          }
        },
        toFetchPolicyError,
      );
    } catch (error) {
      throw new ExternalServiceError(
        `Failed to broadcast transaction`,
        { network, txid: transaction.compute_txid().toString() },
        error,
      );
    }
  }

  async getFeeEstimates(network: Network): Promise<FeeEstimates> {
    try {
      return await executeWithFetchPolicy(
        this.#policies[network],
        async () => this.#clients[network].get_fee_estimates(),
        toFetchPolicyError,
      );
    } catch (error) {
      throw new ExternalServiceError(
        `Failed to fetch fee estimates`,
        { network },
        error,
      );
    }
  }

  getExplorerUrl(network: Network): string {
    return this.#config.explorerUrl[network];
  }

  async getTransactionSenders(
    network: Network,
    txid: string,
  ): Promise<string[]> {
    const cacheKey = `${network}:${txid}`;
    const cached = this.#sendersCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request = this.#fetchTransactionSenders(network, txid);
    this.#sendersCache.set(cacheKey, request);

    try {
      return await request;
    } catch (error) {
      // Do not keep failures cached: a rate limit or transient outage should
      // not permanently suppress a counterparty.
      this.#sendersCache.delete(cacheKey);
      throw error;
    }
  }

  /**
   * Fetches the funding addresses of a transaction from the Esplora REST API.
   *
   * Unlike the WASM client's `get_tx`, the REST endpoint resolves each input's
   * `prevout`, so all senders are returned in a single request. The request is
   * bounded by the shared fetch helper's per-attempt timeout so a stalled
   * indexer surfaces as a best-effort failure instead of hanging the caller.
   *
   * @param network - Network the transaction belongs to.
   * @param txid - Transaction id.
   * @returns The funding addresses, deduped, in input order.
   */
  async #fetchTransactionSenders(
    network: Network,
    txid: string,
  ): Promise<string[]> {
    const body = await fetchWithPolicy(
      this.#policies[network],
      `${this.#restUrls[network]}/tx/${txid}`,
    );
    const transaction = JSON.parse(body) as EsploraTx;
    // Self-transfers and consolidations can repeat the same funding address;
    // dedupe while preserving input order.
    const senders = [
      ...new Set(
        transaction.vin
          .map((input) => input.prevout?.scriptpubkey_address)
          .filter((address): address is string => Boolean(address)),
      ),
    ];
    return senders;
  }
}
