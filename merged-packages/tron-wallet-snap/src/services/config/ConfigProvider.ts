/* eslint-disable no-restricted-globals */
import type { Infer } from '@metamask/superstruct';
import {
  array,
  coerce,
  create,
  enums,
  object,
  string,
} from '@metamask/superstruct';
import { Duration } from '@metamask/utils';

import { Network, Networks } from '../../constants';
import { UrlStruct } from '../../validation/structs';

const ENVIRONMENT_TO_ACTIVE_NETWORKS = {
  production: [Network.Mainnet],
  local: [Network.Mainnet, Network.Nile, Network.Shasta],
  test: [Network.Localnet],
};

const CommaSeparatedListOfUrlsStruct = coerce(
  array(UrlStruct),
  string(),
  (value: string) => value.split(','),
);

const CommaSeparatedListOfStringsStruct = coerce(
  array(string()),
  string(),
  (value: string) => value.split(','),
);

const EnvStruct = object({
  ENVIRONMENT: enums(['local', 'test', 'production']),
  RPC_URL_LIST_MAINNET: CommaSeparatedListOfUrlsStruct,
  RPC_URL_LIST_NILE_TESTNET: CommaSeparatedListOfUrlsStruct,
  RPC_URL_LIST_SHASTA_TESTNET: CommaSeparatedListOfUrlsStruct,
  RPC_URL_LIST_LOCALNET: CommaSeparatedListOfStringsStruct,
  EXPLORER_MAINNET_BASE_URL: UrlStruct,
  EXPLORER_NILE_BASE_URL: UrlStruct,
  EXPLORER_SHASTA_BASE_URL: UrlStruct,
  PRICE_API_BASE_URL: UrlStruct,
  TOKEN_API_BASE_URL: UrlStruct,
  STATIC_API_BASE_URL: UrlStruct,
  SECURITY_ALERTS_API_BASE_URL: UrlStruct,
  NFT_API_BASE_URL: UrlStruct,
  LOCAL_API_BASE_URL: string(),
});

export type Env = Infer<typeof EnvStruct>;

export type NetworkConfig = (typeof Networks)[Network] & {
  rpcUrls: string[];
  explorerBaseUrl: string;
};

export type Config = {
  environment: string;
  networks: NetworkConfig[];
  activeNetworks: Network[];
  priceApi: {
    baseUrl: string;
    chunkSize: number;
    cacheTtlsMilliseconds: {
      fiatExchangeRates: number;
      spotPrices: number;
      historicalPrices: number;
    };
  };
  tokenApi: {
    baseUrl: string;
    chunkSize: number;
  };
  staticApi: {
    baseUrl: string;
  };
  transactions: {
    storageLimit: number;
  };
  securityAlertsApi: {
    baseUrl: string;
  };
  nftApi: {
    baseUrl: string;
    cacheTtlsMilliseconds: {
      listAddressSolanaNfts: number;
      getNftMetadata: number;
    };
  };
};

/**
 * A utility class that provides the configuration of the snap.
 *
 * @example
 * const configProvider = new ConfigProvider();
 * const { networks } = configProvider.get();
 * @example
 * // You can use utility methods for more advanced manipulations.
 * const network = configProvider.getNetworkBy('caip2Id', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
 */
export class ConfigProvider {
  readonly #config: Config;

  constructor() {
    const environment = this.#parseEnvironment();
    this.#config = this.#buildConfig(environment);
  }

  #parseEnvironment() {
    const rawEnvironment = {
      ENVIRONMENT: process.env.ENVIRONMENT,
      // RPC
      RPC_URL_LIST_MAINNET: process.env.RPC_URL_LIST_MAINNET,
      RPC_URL_LIST_NILE_TESTNET: process.env.RPC_URL_LIST_NILE_TESTNET,
      RPC_URL_LIST_SHASTA_TESTNET: process.env.RPC_URL_LIST_SHASTA_TESTNET,
      RPC_URL_LIST_LOCALNET: process.env.RPC_URL_LIST_LOCALNET,
      // Block explorer
      EXPLORER_MAINNET_BASE_URL: process.env.EXPLORER_MAINNET_BASE_URL,
      EXPLORER_NILE_BASE_URL: process.env.EXPLORER_NILE_BASE_URL,
      EXPLORER_SHASTA_BASE_URL: process.env.EXPLORER_SHASTA_BASE_URL,
      // APIs
      PRICE_API_BASE_URL: process.env.PRICE_API_BASE_URL,
      TOKEN_API_BASE_URL: process.env.TOKEN_API_BASE_URL,
      STATIC_API_BASE_URL: process.env.STATIC_API_BASE_URL,
      SECURITY_ALERTS_API_BASE_URL: process.env.SECURITY_ALERTS_API_BASE_URL,
      NFT_API_BASE_URL: process.env.NFT_API_BASE_URL,
      LOCAL_API_BASE_URL: process.env.LOCAL_API_BASE_URL,
    };

    // Validate and parse them before returning
    return create(rawEnvironment, EnvStruct);
  }

  #buildConfig(environment: Env): Config {
    return {
      environment: environment.ENVIRONMENT,
      networks: [
        {
          ...Networks[Network.Mainnet],
          rpcUrls: environment.RPC_URL_LIST_MAINNET,
          explorerBaseUrl: environment.EXPLORER_MAINNET_BASE_URL,
        },
        {
          ...Networks[Network.Nile],
          rpcUrls: environment.RPC_URL_LIST_NILE_TESTNET,
          explorerBaseUrl: environment.EXPLORER_NILE_BASE_URL,
        },
        {
          ...Networks[Network.Shasta],
          rpcUrls: environment.RPC_URL_LIST_SHASTA_TESTNET,
          explorerBaseUrl: environment.EXPLORER_SHASTA_BASE_URL,
        },
        {
          ...Networks[Network.Localnet],
          rpcUrls: environment.RPC_URL_LIST_LOCALNET,
          explorerBaseUrl: environment.EXPLORER_MAINNET_BASE_URL,
        },
      ],
      activeNetworks: ENVIRONMENT_TO_ACTIVE_NETWORKS[environment.ENVIRONMENT],
      priceApi: {
        baseUrl:
          environment.ENVIRONMENT === 'test'
            ? environment.LOCAL_API_BASE_URL
            : environment.PRICE_API_BASE_URL,
        chunkSize: 50,
        cacheTtlsMilliseconds: {
          fiatExchangeRates: Duration.Minute,
          spotPrices: Duration.Minute,
          historicalPrices: Duration.Minute,
        },
      },
      tokenApi: {
        baseUrl:
          environment.ENVIRONMENT === 'test'
            ? environment.LOCAL_API_BASE_URL
            : environment.TOKEN_API_BASE_URL,
        chunkSize: 50,
      },
      staticApi: {
        baseUrl: environment.STATIC_API_BASE_URL,
      },
      transactions: {
        storageLimit: 10,
      },
      securityAlertsApi: {
        baseUrl:
          environment.ENVIRONMENT === 'test'
            ? environment.LOCAL_API_BASE_URL
            : environment.SECURITY_ALERTS_API_BASE_URL,
      },
      nftApi: {
        baseUrl:
          environment.ENVIRONMENT === 'test'
            ? environment.LOCAL_API_BASE_URL
            : environment.NFT_API_BASE_URL,
        cacheTtlsMilliseconds: {
          listAddressSolanaNfts: Duration.Minute,
          getNftMetadata: Duration.Minute,
        },
      },
    };
  }

  public get(): Config {
    return this.#config;
  }

  public getNetworkBy(key: keyof NetworkConfig, value: string): NetworkConfig {
    const network = this.get().networks.find((item) => item[key] === value);
    if (!network) {
      throw new Error(`Network ${key} not found`);
    }
    return network;
  }
}
