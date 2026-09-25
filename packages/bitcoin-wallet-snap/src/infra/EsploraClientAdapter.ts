import type {
  FeeEstimates,
  Network,
  Transaction,
} from '@metamask/bitcoindevkit';
import { EsploraClient } from '@metamask/bitcoindevkit';

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

export class EsploraClientAdapter implements BlockchainClient {
  // Should be a Repository but we don't support custom networks so we can save in memory from config values
  readonly #clients: Record<Network, EsploraClient>;

  readonly #config: ChainConfig;

  readonly #restUrls: Record<Network, string>;

  // Funding addresses are resolved while mapping transactions, which runs on
  // every sync/event emission. Cache by network + txid so a receive is only
  // looked up once instead of on each notification.
  readonly #sendersCache = new Map<string, Promise<string[]>>();

  constructor(config: ChainConfig) {
    this.#clients = {
      bitcoin: new EsploraClient(config.url.bitcoin, config.maxRetries),
      testnet: new EsploraClient(config.url.testnet, config.maxRetries),
      testnet4: new EsploraClient(config.url.testnet4, config.maxRetries),
      signet: new EsploraClient(config.url.signet, config.maxRetries),
      regtest: new EsploraClient(config.url.regtest, config.maxRetries),
    };

    this.#restUrls = {
      bitcoin: toEsploraRestUrl(config.url.bitcoin),
      testnet: toEsploraRestUrl(config.url.testnet),
      testnet4: toEsploraRestUrl(config.url.testnet4),
      signet: toEsploraRestUrl(config.url.signet),
      regtest: toEsploraRestUrl(config.url.regtest),
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
      const request = account.startFullScan();
      const update = await this.#clients[account.network].full_scan(
        request,
        stopGap,
        this.#config.parallelRequests,
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
      const request = account.startSync();
      const update = await this.#clients[account.network].sync(
        request,
        this.#config.parallelRequests,
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
      await this.#clients[network].broadcast(transaction);
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
      return await this.#clients[network].get_fee_estimates();
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
   * `prevout`, so all senders are returned in a single request.
   *
   * @param network - Network the transaction belongs to.
   * @param txid - Transaction id.
   * @returns The funding addresses, deduped, in input order.
   */
  async #fetchTransactionSenders(
    network: Network,
    txid: string,
  ): Promise<string[]> {
    const response = await fetch(`${this.#restUrls[network]}/tx/${txid}`);

    if (!response.ok) {
      throw new ExternalServiceError(`Failed to fetch transaction`, {
        network,
        txid,
        status: response.status,
      });
    }

    const transaction = (await response.json()) as EsploraTx;
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
