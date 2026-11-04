import type {
  FeeEstimates,
  Network,
  ScriptBuf,
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
  Keychain,
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

const KEYCHAINS: Keychain[] = ['external', 'internal'];

/**
 * Computes the Electrum/Esplora script hash of an output script: the SHA-256
 * of the script, byte-reversed, hex-encoded (the key of `/scripthash/:hash`).
 *
 * @param script - The output script bytes.
 * @returns The script hash.
 */
export async function toScripthash(script: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', script),
  );
  return Array.from(digest.reverse(), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
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

  readonly #logger: Logger;

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
    this.#logger = logger;
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

  async extendDiscoveryScan(account: BitcoinAccount): Promise<void> {
    let hasHistory: boolean;
    try {
      hasHistory = await this.#hasHistoryInGapExtension(account);
    } catch (error) {
      // Never leave the account with the discovery gap only: fall back to the
      // standard-gap full scan (which surfaces its own failure).
      this.#logger.warn(
        `[esplora ${account.network}] standard-gap check failed, running the standard-gap scan`,
        error,
      );
      hasHistory = true;
    }
    if (hasHistory) {
      await this.fullScan(account, 'scan');
    }
  }

  /**
   * Lists, per keychain, the scripts a standard-gap full scan covers beyond
   * the discovery-gap scan just applied to the account. A gap scan covers up
   * to `last active index + stop gap` (indexes `0..stopGap-1` when nothing is
   * active), so the discovery scan already fetched up to
   * `lastUsed + discovery`. The upper bound also accounts for revealed
   * addresses, so the check never covers less than the standard-gap scan.
   *
   * @param account - The account.
   * @returns The scripts to check.
   */
  #gapExtensionScripts(account: BitcoinAccount): ScriptBuf[] {
    const { discovery, scan } = this.#config.stopGap;
    const scripts: ScriptBuf[] = [];
    for (const keychain of KEYCHAINS) {
      const lastUsed = account.lastUsedIndex(keychain) ?? -1;
      const lastRevealed = account.lastRevealedIndex(keychain) ?? -1;
      const first = lastUsed + discovery + 1;
      const last = Math.max(lastUsed, lastRevealed) + scan;
      for (let index = first; index <= last; index++) {
        scripts.push(
          account.peekKeychainAddress(keychain, index).address.script_pubkey,
        );
      }
    }
    return scripts;
  }

  async #hasHistoryInGapExtension(account: BitcoinAccount): Promise<boolean> {
    const scripts = this.#gapExtensionScripts(account);
    const batchSize = Math.max(1, this.#config.parallelRequests);
    for (let start = 0; start < scripts.length; start += batchSize) {
      const results = await Promise.all(
        scripts
          .slice(start, start + batchSize)
          .map(async (script) =>
            this.#scriptHasHistory(account.network, script),
          ),
      );
      if (results.some(Boolean)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Whether an address has any transaction history, from the Esplora REST
   * API. The request goes through the network's shared fetch policy (retries,
   * circuit breaker, and per-attempt timeout).
   *
   * @param network - Network of the address.
   * @param script - Output script of the address.
   * @returns `true` unless the indexer reports an empty history.
   */
  async #scriptHasHistory(
    network: Network,
    script: ScriptBuf,
  ): Promise<boolean> {
    const scripthash = await toScripthash(script.as_bytes());
    const body = await fetchWithPolicy(
      this.#policies[network],
      `${this.#restUrls[network]}/scripthash/${scripthash}/txs`,
    );
    const history = JSON.parse(body) as unknown;
    // Anything but an empty list counts as history: the caller then runs the
    // standard-gap full scan.
    return !Array.isArray(history) || history.length > 0;
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
