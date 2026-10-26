import type {
  FeeEstimates,
  Network,
  ScriptBuf,
  Transaction,
} from '@metamask/bitcoindevkit';
import { EsploraClient } from '@metamask/bitcoindevkit';
import { BtcScope } from '@metamask/keyring-api';
import type { FetchPolicy, Logger } from '@metamask/snap-networks-utils';
import {
  createFetchPolicy,
  createFetchPolicyError,
  executeWithFetchPolicy,
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

/**
 * Upper bound on a single sender lookup request. A stalled connection would
 * otherwise never settle, blocking the sync that awaits it and suppressing the
 * transaction event; the WASM client applies its own retry budget, so the raw
 * REST lookup needs an equivalent bound.
 */
export const SENDER_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Upper bound on a single address history request of the standard-gap check
 * (see `extendDiscoveryScan`), for the same reason as
 * {@link SENDER_REQUEST_TIMEOUT_MS}.
 */
export const GAP_CHECK_REQUEST_TIMEOUT_MS = 10_000;

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

/**
 * Upper bound on a whole sync (all its requests and retries).
 * The WASM client sets no timeout on its requests: a request stalled by a
 * suspended or broken connection could otherwise never settle, keeping the
 * coalesced cron sync (and every later cron run joining it) stuck.
 */
export const SYNC_TIMEOUT_MS = 60_000;

/**
 * Upper bound on a whole full scan, for the same reason as
 * {@link SYNC_TIMEOUT_MS}: it also releases the single-flight scan guard.
 */
export const FULL_SCAN_TIMEOUT_MS = 120_000;

/**
 * Rejects with a `TimeoutError` (a transient failure for the fetch policies)
 * if the operation does not settle in time. The abandoned operation's result
 * is discarded: it is never applied to the wallet.
 *
 * @param operation - The operation.
 * @param timeoutMs - The timeout, in milliseconds.
 * @param label - Name of the operation, for the error message.
 * @returns The operation result.
 */
export async function withOperationTimeout<Result>(
  operation: Promise<Result>,
  timeoutMs: number,
  label: string,
): Promise<Result> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${timeoutMs} ms`);
      error.name = 'TimeoutError';
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One Esplora endpoint: the WASM client, the REST base URL, and the fetch
 * policies guarding them.
 */
type EsploraEndpoint = {
  label: 'primary';
  client: EsploraClient;
  restUrl: string;
  /** Guards `full_scan` / `sync` (the WASM client already retries each request). */
  scanPolicy: FetchPolicy;
  /** Guards REST lookups and fee estimates. */
  restPolicy: FetchPolicy;
};

const NETWORKS: Network[] = [
  'bitcoin',
  'testnet',
  'testnet4',
  'signet',
  'regtest',
];

const CHAIN_IDS: Record<Network, string> = {
  bitcoin: BtcScope.Mainnet,
  testnet: BtcScope.Testnet,
  testnet4: BtcScope.Testnet4,
  signet: BtcScope.Signet,
  regtest: BtcScope.Regtest,
};

const noopLogger: Pick<Logger, 'warn'> = {
  warn: () => undefined,
};

export class EsploraClientAdapter implements BlockchainClient {
  // Should be a Repository but we don't support custom networks so we can save in memory from config values
  readonly #endpoints: Record<Network, EsploraEndpoint>;

  readonly #config: ChainConfig;

  readonly #logger: Pick<Logger, 'warn'>;

  // Funding addresses are resolved while mapping transactions, which runs on
  // every sync/event emission. Cache by network + txid so a receive is only
  // looked up once instead of on each notification.
  readonly #sendersCache = new Map<string, Promise<string[]>>();

  constructor(config: ChainConfig, logger: Pick<Logger, 'warn'> = noopLogger) {
    this.#config = config;
    this.#logger = logger;

    const endpoints = {} as Record<Network, EsploraEndpoint>;
    for (const network of NETWORKS) {
      endpoints[network] = this.#createEndpoint(
        network,
        config.url[network],
        'primary',
      );
    }
    this.#endpoints = endpoints;
  }

  #createEndpoint(
    network: Network,
    url: string,
    label: EsploraEndpoint['label'],
  ): EsploraEndpoint {
    const chainIdCaip = CHAIN_IDS[network];
    return {
      label,
      client: new EsploraClient(url, this.#config.maxRetries),
      restUrl: toEsploraRestUrl(url),
      scanPolicy: createFetchPolicy({
        service: `esplora_${label}_scan`,
        chainIdCaip,
        logger: this.#logger,
        maxRetries: 1,
      }),
      restPolicy: createFetchPolicy({
        service: `esplora_${label}_rest`,
        chainIdCaip,
        logger: this.#logger,
      }),
    };
  }

  /**
   * Runs a read against the endpoint under its fetch policy (bounded retries
   * with backoff on transient failures, circuit breaker).
   *
   * @param network - The network.
   * @param policy - Which of the endpoint's policies guards the call.
   * @param operation - The read, given the endpoint to use.
   * @returns The read result.
   */
  async #read<Result>(
    network: Network,
    policy: 'scanPolicy' | 'restPolicy',
    operation: (endpoint: EsploraEndpoint) => Promise<Result>,
  ): Promise<Result> {
    const endpoint = this.#endpoints[network];
    return executeWithFetchPolicy(endpoint[policy], async () =>
      operation(endpoint),
    );
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
      // The WASM client consumes the request, so each attempt builds its own.
      const update = await withOperationTimeout(
        this.#read(account.network, 'scanPolicy', async ({ client }) =>
          client.full_scan(
            account.startFullScan(),
            stopGap,
            this.#config.parallelRequests,
          ),
        ),
        FULL_SCAN_TIMEOUT_MS,
        'Full scan',
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

  async #scriptHasHistory(
    network: Network,
    script: ScriptBuf,
  ): Promise<boolean> {
    const scripthash = await toScripthash(script.as_bytes());
    const history = await this.#read(
      network,
      'restPolicy',
      async ({ restUrl }) => {
        const response = await fetch(
          `${restUrl}/scripthash/${scripthash}/txs`,
          {
            signal: AbortSignal.timeout(GAP_CHECK_REQUEST_TIMEOUT_MS),
          },
        );
        if (!response.ok) {
          throw createFetchPolicyError(`HTTP ${response.status}`, {
            httpStatus: response.status,
          });
        }
        return (await response.json()) as unknown;
      },
    );
    // Anything but an empty list counts as history: the caller then runs the
    // standard-gap full scan.
    return !Array.isArray(history) || history.length > 0;
  }

  async sync(account: BitcoinAccount): Promise<void> {
    try {
      const update = await withOperationTimeout(
        this.#read(account.network, 'scanPolicy', async ({ client }) =>
          client.sync(account.startSync(), this.#config.parallelRequests),
        ),
        SYNC_TIMEOUT_MS,
        'Sync',
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
      // Never retried: a retry could broadcast twice.
      await this.#endpoints[network].client.broadcast(transaction);
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
      return await this.#read(network, 'restPolicy', async ({ client }) =>
        client.get_fee_estimates(),
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
   * bounded by {@link SENDER_REQUEST_TIMEOUT_MS} so a stalled indexer surfaces
   * as a best-effort failure instead of hanging the caller.
   *
   * @param network - Network the transaction belongs to.
   * @param txid - Transaction id.
   * @returns The funding addresses, deduped, in input order.
   */
  async #fetchTransactionSenders(
    network: Network,
    txid: string,
  ): Promise<string[]> {
    let transaction: EsploraTx;
    try {
      transaction = await this.#read(
        network,
        'restPolicy',
        async ({ restUrl }) => {
          const response = await fetch(`${restUrl}/tx/${txid}`, {
            signal: AbortSignal.timeout(SENDER_REQUEST_TIMEOUT_MS),
          });
          if (!response.ok) {
            throw createFetchPolicyError(`HTTP ${response.status}`, {
              httpStatus: response.status,
            });
          }
          return (await response.json()) as EsploraTx;
        },
      );
    } catch (error) {
      const status = (error as { httpStatus?: number }).httpStatus;
      throw new ExternalServiceError(
        `Failed to fetch transaction`,
        status === undefined ? { network, txid } : { network, txid, status },
        error,
      );
    }

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
