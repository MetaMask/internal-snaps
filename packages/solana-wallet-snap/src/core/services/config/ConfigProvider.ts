/* eslint-disable no-restricted-globals */
import {
  BaseConfigProvider,
  commaSeparatedListOf,
  LogLevelStruct,
  UrlStruct,
} from '@metamask/snap-networks-utils';
import type { Infer } from '@metamask/superstruct';
import { array, enums, number, object, string } from '@metamask/superstruct';
import { Duration } from '@metamask/utils';
import { uniq } from 'lodash';

import { Network, Networks } from '../../constants/solana';
import { getClientStatus } from '../../utils/interface';

export const SUPPORTED_NETWORKS = [Network.Mainnet, Network.Devnet];

const ENVIRONMENT_TO_ACTIVE_NETWORKS: Record<string, Network[]> = {
  production: [Network.Mainnet],
  local: [Network.Mainnet],
  test: [Network.Localnet],
};

const NetworkStruct = enums(Object.values(Network) as [Network, ...Network[]]);

const TokenInfoStruct = object({
  symbol: string(),
  caip19Id: string(),
  address: string(),
  decimals: number(),
});

const NetworkConfigStruct = object({
  caip2Id: NetworkStruct,
  cluster: string(),
  name: string(),
  nativeToken: TokenInfoStruct,
  rpcUrls: commaSeparatedListOf(UrlStruct),
  webSocketUrl: UrlStruct,
});

const ConfigStruct = object({
  environment: enums(['local', 'test', 'production']),
  logLevel: LogLevelStruct,
  networks: array(NetworkConfigStruct),
  explorerBaseUrl: UrlStruct,
  priceApi: object({
    baseUrl: UrlStruct,
    chunkSize: number(),
    cacheTtlsMilliseconds: object({
      spotPrices: number(),
    }),
  }),
  tokenApi: object({
    baseUrl: UrlStruct,
    chunkSize: number(),
  }),
  staticApi: object({
    baseUrl: UrlStruct,
  }),
  transactions: object({
    storageLimit: number(),
  }),
  securityAlertsApi: object({
    baseUrl: UrlStruct,
  }),
  nftApi: object({
    baseUrl: UrlStruct,
    cacheTtlsMilliseconds: object({
      listAddressSolanaNfts: number(),
      getNftMetadata: number(),
    }),
  }),
  subscriptions: object({
    maxReconnectAttempts: number(),
    reconnectDelayMilliseconds: number(),
    /**
     * The time we wait before closing the connections when the extension becomes inactive.
     * This is to avoid closing and opening the connections too much when the user switches back and forth between the client and a dapp for instance.
     */
    closeConnectionsGracePeriodMilliseconds: number(),
  }),
});

/**
 * The environment consumed by the snap. Each `process.env` reference is
 * replaced with its build-time value (see `snap.config.ts`).
 */
const ENVIRONMENT = {
  environment: process.env.ENVIRONMENT,
  logLevel: process.env.LOG_LEVEL,
  networks: [
    {
      ...Networks[Network.Mainnet],
      rpcUrls: process.env.RPC_URL_MAINNET_LIST,
      webSocketUrl: process.env.RPC_WEB_SOCKET_URL_MAINNET,
    },
    {
      ...Networks[Network.Devnet],
      rpcUrls: process.env.RPC_URL_DEVNET_LIST,
      webSocketUrl: process.env.RPC_WEB_SOCKET_URL_DEVNET,
    },
    {
      ...Networks[Network.Testnet],
      rpcUrls: process.env.RPC_URL_TESTNET_LIST,
      webSocketUrl: process.env.RPC_WEB_SOCKET_URL_TESTNET,
    },
    {
      ...Networks[Network.Localnet],
      rpcUrls: process.env.RPC_URL_LOCALNET_LIST,
      webSocketUrl: process.env.RPC_WEB_SOCKET_URL_LOCALNET,
    },
  ],
  explorerBaseUrl: process.env.EXPLORER_BASE_URL,
  priceApi: {
    baseUrl: process.env.PRICE_API_BASE_URL,
    chunkSize: 50,
    cacheTtlsMilliseconds: {
      spotPrices: Duration.Minute,
    },
  },
  tokenApi: {
    baseUrl: process.env.TOKEN_API_BASE_URL,
    chunkSize: 50,
  },
  staticApi: {
    baseUrl: process.env.STATIC_API_BASE_URL,
  },
  securityAlertsApi: {
    baseUrl: process.env.SECURITY_ALERTS_API_BASE_URL, // Blockaid
  },
  nftApi: {
    baseUrl: process.env.NFT_API_BASE_URL,
    cacheTtlsMilliseconds: {
      listAddressSolanaNfts: Duration.Minute,
      getNftMetadata: Duration.Minute,
    },
  },
  transactions: {
    storageLimit: 10,
  },
  subscriptions: {
    maxReconnectAttempts: 5,
    reconnectDelayMilliseconds: Duration.Second,
    closeConnectionsGracePeriodMilliseconds: Duration.Minute * 5,
  },
};

export type NetworkConfig = Infer<typeof NetworkConfigStruct>;

export type Config = Infer<typeof ConfigStruct>;

/**
 * A utility class that provides the configuration of the snap.
 *
 * @example
 * const configProvider = new ConfigProvider();
 * const { networks } = configProvider.config;
 * @example
 * // You can use utility methods for more advanced manipulations.
 * const network = configProvider.getNetworkBy('caip2Id', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
 */
export class ConfigProvider extends BaseConfigProvider<typeof ConfigStruct> {
  #activeNetworks: Network[];

  /**
   * @param env - The environment to parse. Defaults to the module-level
   * environment, whose `process.env` references are replaced with their
   * build-time values (see `snap.config.ts`).
   */
  constructor(env = ENVIRONMENT) {
    super(env, ConfigStruct);
    this.#activeNetworks = [];
  }

  public getNetworkBy(key: keyof NetworkConfig, value: string): NetworkConfig {
    const network = this.config.networks.find((item) => item[key] === value);
    if (!network) {
      throw new Error(`Network ${key} not found`);
    }
    return network;
  }

  async getActiveNetworks(): Promise<Network[]> {
    // If the active networks are already set, return them
    if (this.#activeNetworks.length > 0) {
      return this.#activeNetworks;
    }

    const baseNetworks = uniq([
      Network.Mainnet,
      ...(ENVIRONMENT_TO_ACTIVE_NETWORKS[this.config.environment] ?? []),
    ]);

    try {
      // Otherwise, fetch them from the client
      const { clientVersion } = await getClientStatus();
      const isFlask = clientVersion.includes('flask');
      const flaskNetworks = isFlask ? [Network.Devnet] : [];

      const activeNetworks = uniq([...baseNetworks, ...flaskNetworks]);

      // Set the active networks
      this.#activeNetworks = activeNetworks;
      return this.#activeNetworks;
    } catch {
      return baseNetworks;
    }
  }
}

export const configProvider = new ConfigProvider();
