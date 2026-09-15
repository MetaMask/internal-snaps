/* eslint-disable no-restricted-globals */
import {
  BaseConfigProvider,
  UrlStruct,
  commaSeparatedListOf,
  LogLevelStruct,
} from '@metamask/snap-networks-utils';
import type { Infer } from '@metamask/superstruct';
import { array, enums, number, object, record } from '@metamask/superstruct';
import { Duration } from '@metamask/utils';

import { Network } from '../../constants';

const NetworkStruct = enums(Object.values(Network) as [Network, ...Network[]]);

const NetworkConfigStruct = object({
  caip2Id: NetworkStruct,
  rpcUrls: commaSeparatedListOf(UrlStruct),
  explorerBaseUrl: UrlStruct,
});

const ConfigStruct = object({
  environment: enums(['local', 'test', 'production']),
  logLevel: LogLevelStruct,
  networks: array(NetworkConfigStruct),
  activeNetworks: array(NetworkStruct),
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
  trongridApi: object({
    baseUrls: record(NetworkStruct, UrlStruct),
  }),
  tronHttpApi: object({
    baseUrls: record(NetworkStruct, UrlStruct),
  }),
});

const ENVIRONMENT_TO_ACTIVE_NETWORKS: Record<string, Network[]> = {
  production: [Network.Mainnet],
  local: [Network.Mainnet],
  test: [Network.Mainnet],
};

/**
 * The environment consumed by the snap. Each `process.env` reference is
 * replaced with its build-time value (see `snap.config.ts`).
 */
export const ENVIRONMENT = {
  environment: process.env.ENVIRONMENT,
  logLevel: process.env.LOG_LEVEL,
  networks: [
    {
      caip2Id: Network.Mainnet,
      rpcUrls: process.env.RPC_URL_LIST_MAINNET,
      explorerBaseUrl: process.env.EXPLORER_MAINNET_BASE_URL,
    },
    {
      caip2Id: Network.Nile,
      rpcUrls: process.env.RPC_URL_LIST_NILE_TESTNET,
      explorerBaseUrl: process.env.EXPLORER_NILE_BASE_URL,
    },
    {
      caip2Id: Network.Shasta,
      rpcUrls: process.env.RPC_URL_LIST_SHASTA_TESTNET,
      explorerBaseUrl: process.env.EXPLORER_SHASTA_BASE_URL,
    },
  ],
  activeNetworks: ENVIRONMENT_TO_ACTIVE_NETWORKS[process.env.ENVIRONMENT ?? ''],
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
    baseUrl: process.env.SECURITY_ALERTS_API_BASE_URL,
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
  trongridApi: {
    baseUrls: {
      [Network.Mainnet]: process.env.TRONGRID_BASE_URL_MAINNET,
      [Network.Nile]: process.env.TRONGRID_BASE_URL_NILE,
      [Network.Shasta]: process.env.TRONGRID_BASE_URL_SHASTA,
    },
  },
  tronHttpApi: {
    baseUrls: {
      [Network.Mainnet]: process.env.TRON_HTTP_BASE_URL_MAINNET,
      [Network.Nile]: process.env.TRON_HTTP_BASE_URL_NILE,
      [Network.Shasta]: process.env.TRON_HTTP_BASE_URL_SHASTA,
    },
  },
};

export type NetworkConfig = Infer<typeof NetworkConfigStruct>;

export type Config = Infer<typeof ConfigStruct>;

/**
 * A utility class that provides the configuration of the snap.
 *
 * @example
 * const { networks } = configProvider.config;
 * @example
 * // You can use utility methods for more advanced manipulations.
 * const network = configProvider.getNetworkBy('caip2Id', 'tron:0x2b6653dc');
 */
export class ConfigProvider extends BaseConfigProvider<typeof ConfigStruct> {
  /**
   * @param env - The environment to parse. Defaults to the module-level
   * environment, whose `process.env` references are replaced with their
   * build-time values (see `snap.config.ts`).
   */
  constructor(env = ENVIRONMENT) {
    super(env, ConfigStruct);
  }

  public getNetworkBy(key: keyof NetworkConfig, value: string): NetworkConfig {
    const network = this.config.networks.find((item) => item[key] === value);
    if (!network) {
      throw new Error(`Network ${key} not found`);
    }
    return network;
  }
}

/**
 * The configuration provider of the snap.
 * The environment is parsed and the config built exactly once, when this
 * module is imported.
 */
export const configProvider = new ConfigProvider();
