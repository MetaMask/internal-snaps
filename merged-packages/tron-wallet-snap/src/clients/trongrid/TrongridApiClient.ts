import { assert } from '@metamask/superstruct';

import {
  ChainParametersResponseStruct,
  ChainParameterStruct,
  ContractTransactionInfoStruct,
  TransactionInfoStruct,
  TriggerConstantContractResponseStruct,
  TronAccountStruct,
  TrongridApiMetaStruct,
} from './structs';
import type {
  ChainParameter,
  ContractTransactionInfo,
  TransactionInfo,
  TriggerConstantContractRequest,
  TriggerConstantContractResponse,
  TronAccount,
  TrongridApiResponse,
} from './types';
import type { Network } from '../../constants';
import type { ConfigProvider } from '../../services/config';
import { buildUrl } from '../../utils/buildUrl';

export class TrongridApiClient {
  readonly #clients: Map<
    Network,
    {
      baseUrl: string;
      headers: Record<string, string>;
    }
  > = new Map();

  constructor({ configProvider }: { configProvider: ConfigProvider }) {
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
   *
   * @see https://api.trongrid.io/wallet/getchainparameters
   * @param scope - The network to query (e.g., 'mainnet', 'shasta')
   * @returns Promise<ChainParameter> - Chain parameters data
   */
  async getChainParameters(scope: Network): Promise<ChainParameter[]> {
    const client = this.#clients.get(scope);
    if (!client) {
      throw new Error(`No client configured for network: ${scope}`);
    }

    const { baseUrl, headers } = client;
    const url = buildUrl({
      baseUrl,
      path: '/wallet/getchainparameters',
    });

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const rawData = await response.json();

    // Validate response schema
    assert(rawData, ChainParametersResponseStruct);

    if (!rawData.chainParameter) {
      throw new Error('No chain parameters found');
    }

    // Validate each chain parameter
    for (const param of rawData.chainParameter) {
      assert(param, ChainParameterStruct);
    }

    return rawData.chainParameter;
  }

  /**
   * Trigger a constant contract call to estimate energy consumption.
   * This is a read-only call that doesn't broadcast to the network.
   *
   * @see https://developers.tron.network/reference/triggerconstantcontract
   * @param scope - The network to query (e.g., 'mainnet', 'shasta')
   * @param request - The contract call parameters
   * @returns Promise<TriggerConstantContractResponse> - Energy estimation and execution result
   */
  async triggerConstantContract(
    scope: Network,
    request: TriggerConstantContractRequest,
  ): Promise<TriggerConstantContractResponse> {
    const client = this.#clients.get(scope);
    if (!client) {
      throw new Error(`No client configured for network: ${scope}`);
    }

    const { baseUrl, headers } = client;
    const url = buildUrl({
      baseUrl,
      path: '/wallet/triggerconstantcontract',
    });

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        Object.fromEntries(
          Object.entries(request).filter(
            ([_key, value]) => value !== undefined && value !== null,
          ),
        ),
      ),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result: TriggerConstantContractResponse = await response.json();

    // Validate response schema
    assert(result, TriggerConstantContractResponseStruct);

    return result;
  }
}
