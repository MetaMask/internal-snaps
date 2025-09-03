import type {
  TRC10TokenInfo,
  TRC10TokenMetadata,
  TRC20TokenMetadata,
  TriggerConstantContractRequest,
  TriggerConstantContractResponse,
  TronContract,
} from './types';
import type { Network } from '../../constants';
import { NULL_ADDRESS } from '../../constants';
import type { ConfigProvider } from '../../services/config';

/**
 * Client for Tron JSON-RPC HTTP endpoints (not the REST API)
 * Handles contract interactions, constant contract calls, etc.
 */
export class TronHttpClient {
  readonly #apiKey?: string;

  readonly #clients: Map<
    Network,
    {
      baseUrl: string;
      headers: Record<string, string>;
    }
  > = new Map();

  constructor({ configProvider }: { configProvider: ConfigProvider }) {
    const { apiKey } = configProvider.get().trongridApi;
    const { baseUrls } = configProvider.get().tronHttpApi;
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
   * Get contract information by address
   *
   * @param contractAddress - The contract address
   * @param network - The network to query
   * @returns Promise<TronContract> - Contract information
   */
  async getContract(
    contractAddress: string,
    network: Network,
  ): Promise<TronContract> {
    const client = this.#clients.get(network);
    if (!client) {
      throw new Error(`No client configured for network: ${network}`);
    }

    const { baseUrl, headers } = client;
    const url = `${baseUrl}/wallet/getcontract`;

    const body = JSON.stringify({
      value: contractAddress,
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

    const contractData: TronContract = await response.json();
    return contractData;
  }

  /**
   * Call a constant function on a TRC20 contract
   *
   * @param contractAddress - The contract address
   * @param functionSelector - The function selector (e.g., 'name()', 'symbol()', 'decimals()')
   * @param network - The network to query
   * @returns Promise<string[]> - The function result
   */
  async triggerConstantContract(
    contractAddress: string,
    functionSelector: string,
    network: Network,
  ): Promise<string[]> {
    const client = this.#clients.get(network);
    if (!client) {
      throw new Error(`No client configured for network: ${network}`);
    }

    const { baseUrl, headers } = client;
    const url = `${baseUrl}/wallet/triggerconstantcontract`;

    const requestBody: TriggerConstantContractRequest = {
      /* eslint-disable-next-line @typescript-eslint/naming-convention */
      owner_address: NULL_ADDRESS,
      /* eslint-disable-next-line @typescript-eslint/naming-convention */
      contract_address: contractAddress,
      /* eslint-disable-next-line @typescript-eslint/naming-convention */
      function_selector: functionSelector,
      parameter: '',
      visible: true,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseData: TriggerConstantContractResponse = await response.json();

    if (!responseData.result?.result) {
      throw new Error(`Contract call failed: ${JSON.stringify(responseData)}`);
    }

    return responseData.constant_result;
  }

  /**
   * Decode hex string to UTF-8 string (for name and symbol)
   *
   * @param hexString - The hex string to decode
   * @returns string - The decoded string
   */
  #decodeHexToString(hexString: string): string {
    if (!hexString) return '';

    try {
      // Remove '0x' prefix if present
      const cleanHex = hexString.startsWith('0x')
        ? hexString.slice(2)
        : hexString;

      // ABI-encoded string format:
      // - First 32 bytes (64 hex chars): offset to data (usually 0x20 = 32)
      // - Next 32 bytes (64 hex chars): length of string
      // - Next N bytes: the actual string data

      const lengthHex = cleanHex.slice(64, 128); // bytes 32-64
      const length = parseInt(lengthHex, 16); // length in bytes

      if (length === 0) return '';

      const dataStartIndex = 128; // Start after offset + length (64 + 64)
      const dataEndIndex = dataStartIndex + length * 2; // length * 2 because each byte = 2 hex chars
      const dataHex = cleanHex.slice(dataStartIndex, dataEndIndex);

      // Convert hex to string
      let result = '';
      for (let index = 0; index < dataHex.length; index += 2) {
        const byte = dataHex.substr(index, 2);
        const charCode = parseInt(byte, 16);
        if (charCode > 0) {
          // Only add non-null characters
          result += String.fromCharCode(charCode);
        }
      }

      return result.trim();
    } catch (error) {
      console.error('Error decoding hex string:', error, 'hex:', hexString);
      return '';
    }
  }

  /**
   * Decode hex string to number (for decimals)
   *
   * @param hexString - The hex string to decode
   * @returns number - The decoded number
   */
  #decodeHexToNumber(hexString: string): number {
    if (!hexString) return 0;

    // Remove '0x' prefix if present
    const cleanHex = hexString.startsWith('0x')
      ? hexString.slice(2)
      : hexString;

    return parseInt(cleanHex, 16);
  }

  /**
   * Get TRC20 token metadata (name, symbol, decimals)
   *
   * @param contractAddress - The TRC20 contract address
   * @param network - The network to query
   * @returns Promise<TRC20TokenMetadata> - Token metadata
   */
  async getTRC20TokenMetadata(
    contractAddress: string,
    network: Network,
  ): Promise<TRC20TokenMetadata> {
    const [nameResult, symbolResult, decimalsResult] = await Promise.all([
      this.triggerConstantContract(contractAddress, 'name()', network),
      this.triggerConstantContract(contractAddress, 'symbol()', network),
      this.triggerConstantContract(contractAddress, 'decimals()', network),
    ]);

    const name = this.#decodeHexToString(nameResult[0] ?? '');
    const symbol = this.#decodeHexToString(symbolResult[0] ?? '');
    const decimals = this.#decodeHexToNumber(decimalsResult[0] ?? '0');

    return {
      name,
      symbol,
      decimals,
    };
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
    const url = `${baseUrl}/wallet/getassetissuebyid`;

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
   * Get contract information for all configured networks
   *
   * @param contractAddress - The contract address
   * @returns Promise<Record<Network, TronContract>> - Contract information for all networks
   */
  async getContractForAllNetworks(
    contractAddress: string,
  ): Promise<Record<Network, TronContract>> {
    const results: Record<Network, TronContract> = {} as Record<
      Network,
      TronContract
    >;

    for (const [network] of this.#clients) {
      try {
        results[network] = await this.getContract(contractAddress, network);
      } catch (error) {
        console.warn(`Failed to get contract for network ${network}:`, error);
        // You might want to handle this differently based on your requirements
      }
    }

    return results;
  }

  /**
   * Get TRC20 token metadata for all configured networks
   *
   * @param contractAddress - The TRC20 contract address
   * @returns Promise<Record<Network, TRC20TokenMetadata>> - Token metadata for all networks
   */
  async getTRC20TokenMetadataForAllNetworks(
    contractAddress: string,
  ): Promise<Record<Network, TRC20TokenMetadata>> {
    const results: Record<Network, TRC20TokenMetadata> = {} as Record<
      Network,
      TRC20TokenMetadata
    >;

    for (const [network] of this.#clients) {
      try {
        results[network] = await this.getTRC20TokenMetadata(
          contractAddress,
          network,
        );
      } catch (error) {
        console.warn(
          `Failed to get TRC20 token metadata for network ${network}:`,
          error,
        );
        // You might want to handle this differently based on your requirements
      }
    }

    return results;
  }
}
