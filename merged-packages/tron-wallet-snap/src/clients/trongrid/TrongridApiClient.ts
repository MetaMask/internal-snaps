import { assert } from '@metamask/superstruct';

import {
  ContractTransactionInfoStruct,
  TransactionInfoStruct,
  TronAccountStruct,
  TrongridApiMetaStruct,
} from './structs';
import type {
  ContractTransactionInfo,
  TransactionInfo,
  TronAccount,
  TrongridApiResponse,
} from './types';
import type { ICache } from '../../caching/ICache';
import {
  useCacheUntil,
  type ResultWithExpiry,
} from '../../caching/useCacheUntil';
import type { Network } from '../../constants';
import type { ConfigProvider } from '../../services/config';
import { buildUrl } from '../../utils/buildUrl';
import type { Serializable } from '../../utils/serialization/types';
import type { TronHttpClient } from '../tron-http/TronHttpClient';
import type { ChainParameter } from '../tron-http/types';

export class TrongridApiClient {
  readonly #clients: Map<
    Network,
    {
      baseUrl: string;
      headers: Record<string, string>;
    }
  > = new Map();

  readonly #tronHttpClient: TronHttpClient;

  readonly #cache: ICache<Serializable>;

  /**
   * Cached version of getChainParameters that uses maintenance-aligned expiry.
   * The cache is invalidated when the next maintenance period is reached.
   */
  readonly #cachedGetChainParameters: (
    scope: Network,
  ) => Promise<ChainParameter[]>;

  constructor({
    configProvider,
    tronHttpClient,
    cache,
  }: {
    configProvider: ConfigProvider;
    tronHttpClient: TronHttpClient;
    cache: ICache<Serializable>;
  }) {
    const { baseUrls } = configProvider.get().trongridApi;

    // Initialize clients for all networks
    Object.entries(baseUrls).forEach(([network, baseUrl]) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Origin': '*',
      };

      this.#clients.set(network as Network, { baseUrl, headers });
    });

    this.#tronHttpClient = tronHttpClient;
    this.#cache = cache;

    // Create cached version of getChainParameters with maintenance-aligned expiry
    this.#cachedGetChainParameters = useCacheUntil(
      this.#fetchChainParametersWithExpiry.bind(this),
      this.#cache,
      { functionName: 'TrongridApiClient:getChainParameters' },
    );
  }

  /**
   * Get account information by address for a specific network. The returned data will also have assets information.
   *
   * @see https://developers.tron.network/reference/get-account-info-by-address
   * @param scope - The network to query (e.g., 'mainnet', 'shasta')
   * @param address - The TRON address to query
   * @returns Promise<TronAccount> - Account data in camelCase
   */
  async getAccountInfoByAddress(
    scope: Network,
    address: string,
  ): Promise<TronAccount> {
    const client = this.#clients.get(scope);
    if (!client) {
      throw new Error(`No client configured for network: ${scope}`);
    }

    const { baseUrl, headers } = client;
    const url = buildUrl({
      baseUrl,
      path: '/v1/accounts/{address}',
      pathParams: { address },
    });

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const rawData: TrongridApiResponse<TronAccount[]> = await response.json();

    // Validate API response structure
    if (typeof rawData.success !== 'boolean' || !rawData.success) {
      throw new Error('API request failed');
    }
    assert(rawData.meta, TrongridApiMetaStruct);

    if (!rawData.data || rawData.data.length === 0) {
      throw new Error('Account not found or no data returned');
    }

    const account = rawData.data[0];

    if (!account) {
      throw new Error('No data');
    }

    // Validate account data schema
    assert(account, TronAccountStruct);

    return account;
  }

  /**
   * Get native TRX + TRC10 transaction history for an account address.
   *
   * @see https://developers.tron.network/reference/get-transaction-info-by-account-address
   * @param scope - The network to query (e.g., 'mainnet', 'shasta')
   * @param address - The TRON address to query
   * @returns Promise<TransactionInfo[]> - Transaction data in camelCase
   */
  async getTransactionInfoByAddress(
    scope: Network,
    address: string,
  ): Promise<TransactionInfo[]> {
    const client = this.#clients.get(scope);
    if (!client) {
      throw new Error(`No client configured for network: ${scope}`);
    }

    const { baseUrl, headers } = client;
    const url = buildUrl({
      baseUrl,
      path: '/v1/accounts/{address}/transactions',
      pathParams: { address },
    });

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const rawData: TrongridApiResponse<TransactionInfo[]> =
      await response.json();

    // Validate API response structure
    if (typeof rawData.success !== 'boolean' || !rawData.success) {
      throw new Error('API request failed');
    }
    assert(rawData.meta, TrongridApiMetaStruct);

    if (!rawData.data) {
      throw new Error('API request failed');
    }

    // Validate each transaction info
    for (const txInfo of rawData.data) {
      assert(txInfo, TransactionInfoStruct);
    }

    return rawData.data;
  }

  /**
   * Get TRC20 transaction history for an account address.
   *
   * @see https://developers.tron.network/reference/get-trc20-transaction-info-by-account-address
   * @param scope - The network to query (e.g., 'mainnet', 'shasta')
   * @param address - The TRON address to query
   * @returns Promise<ContractTransactionInfo[]> - Contract transaction data in camelCase
   */
  async getContractTransactionInfoByAddress(
    scope: Network,
    address: string,
  ): Promise<ContractTransactionInfo[]> {
    const client = this.#clients.get(scope);
    if (!client) {
      throw new Error(`No client configured for network: ${scope}`);
    }

    const { baseUrl, headers } = client;
    const url = buildUrl({
      baseUrl,
      path: '/v1/accounts/{address}/transactions/trc20',
      pathParams: { address },
    });

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const rawData: TrongridApiResponse<ContractTransactionInfo[]> =
      await response.json();

    // Validate API response structure
    if (typeof rawData.success !== 'boolean' || !rawData.success) {
      throw new Error('API request failed');
    }
    assert(rawData.meta, TrongridApiMetaStruct);

    if (!rawData.data) {
      throw new Error('API request failed');
    }

    // Validate each contract transaction info
    for (const txInfo of rawData.data) {
      assert(txInfo, ContractTransactionInfoStruct);
    }

    return rawData.data;
  }

  /**
   * Get chain parameters for a specific network.
   * Results are cached until the next maintenance period (every ~6 hours).
   *
   * @see https://api.trongrid.io/wallet/getchainparameters
   * @param scope - The network to query (e.g., 'mainnet', 'shasta')
   * @returns Promise<ChainParameter[]> - Chain parameters data
   */
  async getChainParameters(scope: Network): Promise<ChainParameter[]> {
    return this.#cachedGetChainParameters(scope);
  }

  /**
   * Internal method to fetch chain parameters with expiry timestamp.
   * Fetches both chain parameters and next maintenance time in parallel.
   *
   * @param scope - The network to query
   * @returns Promise with result and expiresAt for caching
   */
  async #fetchChainParametersWithExpiry(
    scope: Network,
  ): Promise<ResultWithExpiry<ChainParameter[]>> {
    // Fetch both in parallel for efficiency
    // Delegates to TronHttpClient for the actual API calls
    const [parameters, nextMaintenanceTime] = await Promise.all([
      this.#tronHttpClient.getChainParameters(scope),
      this.#tronHttpClient.getNextMaintenanceTime(scope),
    ]);

    return {
      result: parameters,
      expiresAt: nextMaintenanceTime, // Exact maintenance time, no buffer needed
    };
  }
}
