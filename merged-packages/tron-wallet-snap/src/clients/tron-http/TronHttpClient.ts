import { assert } from '@metamask/superstruct';

import {
  AccountResourcesStruct,
  FullNodeTransactionInfoStruct,
  TRC10TokenInfoStruct,
} from './structs';
import type {
  AccountResources,
  FullNodeTransactionInfo,
  TRC10TokenInfo,
  TRC10TokenMetadata,
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
}
