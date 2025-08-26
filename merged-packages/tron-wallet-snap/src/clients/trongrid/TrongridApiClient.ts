import type {
  TronAccount,
  TrongridApiResponse,
} from './types';
import type { Network } from '../../constants';
import type { ConfigProvider } from '../../services/config';

export class TrongridApiClient {
  readonly #apiKey?: string;

  readonly #clients: Map<
    Network,
    {
      baseUrl: string;
      headers: Record<string, string>;
    }
  > = new Map();

  constructor({ configProvider }: { configProvider: ConfigProvider }) {
    const { apiKey, baseUrls } = configProvider.get().trongridApi;
    this.#apiKey = apiKey;

    // Initialize clients for all networks
    Object.entries(baseUrls).forEach(([network, baseUrl]) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Origin': '*',
      };

      if (this.#apiKey) {
        headers['TRON-PRO-API-KEY'] = this.#apiKey;
      }

      this.#clients.set(network as Network, { baseUrl, headers });
    });
  }

  /**
   * Get account information by address for a specific network
   *
   * @param scope
   * @param address - The TRON address to query
   * @param network - The network to query
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
    const url = `${baseUrl}/v1/accounts/${address}`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const rawData: TrongridApiResponse<TronAccount> =
      await response.json();

    if (!rawData.success) {
      throw new Error('API request failed');
    }

    if (!rawData.data || rawData.data.length === 0) {
      throw new Error('Account not found or no data returned');
    }

    const account = rawData.data[0];
    
    if (!account) {
      throw new Error('No data');
    }

    return account;
  }
}
