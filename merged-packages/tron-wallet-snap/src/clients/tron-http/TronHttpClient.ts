import { assert } from '@metamask/superstruct';

import {
  AccountResourcesStruct,
  ChainParametersResponseStruct,
  ChainParameterStruct,
  FullNodeTransactionInfoStruct,
  NextMaintenanceTimeStruct,
  TRC10TokenInfoStruct,
  TriggerConstantContractResponseStruct,
} from './structs';
import type {
  AccountResources,
  ChainParameter,
  FullNodeTransactionInfo,
  TRC10TokenInfo,
  TRC10TokenMetadata,
  TriggerConstantContractRequest,
  TriggerConstantContractResponse,
} from './types';
import type { Network } from '../../constants';
import type { ConfigProvider } from '../../services/config';
import { buildUrl } from '../../utils/buildUrl';

/**
 * Client for Tron JSON-RPC HTTP endpoints (not the REST API)
 * Handles contract interactions, constant contract calls, etc.
 */
export class TronHttpClient {
  readonly #clients: Map<
    Network,
    {
      baseUrl: string;
      headers: Record<string, string>;
    }
  > = new Map();

  constructor({ configProvider }: { configProvider: ConfigProvider }) {
    const { baseUrls } = configProvider.get().tronHttpApi;

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
   * Get TRC10 token information by ID
   *
   * @param tokenId - The TRC10 token ID
   * @param network - The network to query
   * @returns Promise<TRC10TokenInfo> - Token information
   */
  async getTRC10TokenById(
    tokenId: string,
    network: Network,
  ): Promise<TRC10TokenInfo> {
    const client = this.#clients.get(network);
    if (!client) {
      throw new Error(`No client configured for network: ${network}`);
    }

    const { baseUrl, headers } = client;
    const url = buildUrl({
      baseUrl,
      path: '/wallet/getassetissuebyid',
    });

    const body = JSON.stringify({
      value: tokenId,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const tokenData: TRC10TokenInfo = await response.json();

    // Validate response schema
    assert(tokenData, TRC10TokenInfoStruct);

    return tokenData;
  }

  /**
   * Get TRC10 token metadata (name, symbol, decimals)
   *
   * @param tokenId - The TRC10 token ID
   * @param network - The network to query
   * @returns Promise<TRC10TokenMetadata> - Token metadata
   */
  async getTRC10TokenMetadata(
    tokenId: string,
    network: Network,
  ): Promise<TRC10TokenMetadata> {
    const tokenInfo = await this.getTRC10TokenById(tokenId, network);

    return {
      name: tokenInfo.name,
      symbol: tokenInfo.abbr,
      decimals: tokenInfo.precision,
    };
  }

  /**
   * Get account resources (Energy and Bandwidth)
   *
   * @see https://developers.tron.network/reference/getaccountresource
   * @param network - Network to query
   * @param accountAddress - Account address in base58 format
   * @returns Promise<AccountResources> - Account resources
   */
  async getAccountResources(
    network: Network,
    accountAddress: string,
  ): Promise<AccountResources> {
    const client = this.#clients.get(network);
    if (!client) {
      throw new Error(`No client configured for network: ${network}`);
    }

    const { baseUrl, headers } = client;
    const url = buildUrl({
      baseUrl,
      path: '/wallet/getaccountresource',
    });

    const body = JSON.stringify({
      address: accountAddress,
      visible: true,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const accountResources: AccountResources = await response.json();

    // Validate response schema
    assert(accountResources, AccountResourcesStruct);

    return accountResources;
  }

  /**
   * Get transaction info by transaction ID from Full Node API
   *
   * @see https://developers.tron.network/reference/gettransactioninfobyid
   * @param network - Network to query
   * @param txId - Transaction ID
   * @returns Promise<FullNodeTransactionInfo | null> - Transaction info with block details, or null if not found/confirmed
   */
  async getTransactionInfoById(
    network: Network,
    txId: string,
  ): Promise<FullNodeTransactionInfo | null> {
    const client = this.#clients.get(network);
    if (!client) {
      throw new Error(`No client configured for network: ${network}`);
    }

    const { baseUrl, headers } = client;
    const url = buildUrl({
      baseUrl,
      path: '/wallet/gettransactioninfobyid',
    });

    const body = JSON.stringify({
      value: txId,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Transaction not found
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const txInfo: FullNodeTransactionInfo = await response.json();

    // If the response is empty or doesn't have the expected data, return null
    // Note: GetTransactionInfoById only returns data for confirmed transactions
    if (!txInfo?.id || !txInfo?.blockNumber) {
      return null;
    }

    // Validate response schema
    assert(txInfo, FullNodeTransactionInfoStruct);

    return txInfo;
  }

  /**
   * Get the timestamp of the next maintenance period.
   * Chain parameters can only change at maintenance periods (every ~6 hours).
   *
   * @see https://developers.tron.network/reference/getnextmaintenancetime
   * @param network - The network to query
   * @returns Promise<number> - Unix timestamp in milliseconds of next maintenance
   */
  async getNextMaintenanceTime(network: Network): Promise<number> {
    const client = this.#clients.get(network);
    if (!client) {
      throw new Error(`No client configured for network: ${network}`);
    }

    const { baseUrl, headers } = client;
    const url = buildUrl({
      baseUrl,
      path: '/wallet/getnextmaintenancetime',
    });

    const response = await fetch(url, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Validate response schema
    assert(data, NextMaintenanceTimeStruct);

    return data.num;
  }

  /**
   * Get chain parameters for a specific network.
   *
   * @see https://developers.tron.network/reference/wallet-getchainparameters
   * @param network - The network to query (e.g., 'mainnet', 'shasta')
   * @returns Promise<ChainParameter[]> - Chain parameters data
   */
  async getChainParameters(network: Network): Promise<ChainParameter[]> {
    const client = this.#clients.get(network);
    if (!client) {
      throw new Error(`No client configured for network: ${network}`);
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
   * @param network - The network to query (e.g., 'mainnet', 'shasta')
   * @param request - The contract call parameters
   * @returns Promise<TriggerConstantContractResponse> - Energy estimation and execution result
   */
  async triggerConstantContract(
    network: Network,
    request: TriggerConstantContractRequest,
  ): Promise<TriggerConstantContractResponse> {
    const client = this.#clients.get(network);
    if (!client) {
      throw new Error(`No client configured for network: ${network}`);
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
