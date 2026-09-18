/* eslint-disable no-restricted-globals */
import {
  BaseConfigProvider,
  UrlStruct,
  LogLevelStruct,
} from '@metamask/snap-networks-utils';
import type { Infer } from '@metamask/superstruct';
import { array, enums, number, object, record } from '@metamask/superstruct';
import { Duration } from '@metamask/utils';

import { Network } from '../../constants';

const NetworkStruct = enums(Object.values(Network) as [Network, ...Network[]]);

const ENVIRONMENT_TO_ACTIVE_NETWORKS: Record<string, Network[]> = {
  production: [Network.Mainnet],
  local: [Network.Mainnet],
  test: [Network.Mainnet],
};

/**
 * The struct describing the configuration of the snap, including coercions
 * from raw strings to typed values.
 */
export const ConfigStruct = object({
  environment: enums(['local', 'test', 'production']),
  logLevel: LogLevelStruct,
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
  securityAlertsApi: object({
    baseUrl: UrlStruct,
  }),
  trongridApi: object({
    baseUrls: record(NetworkStruct, UrlStruct),
  }),
  tronHttpApi: object({
    baseUrls: record(NetworkStruct, UrlStruct),
  }),
  explorerApi: object({
    baseUrls: record(NetworkStruct, UrlStruct),
  }),
});

/**
 * The environment consumed by the snap. Each `process.env` reference is
 * replaced with its build-time value (see `snap.config.ts`).
 */
export const ENVIRONMENT = {
  environment: process.env.ENVIRONMENT,
  logLevel: process.env.LOG_LEVEL,
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
  explorerApi: {
    baseUrls: {
      [Network.Mainnet]: process.env.EXPLORER_MAINNET_BASE_URL,
      [Network.Nile]: process.env.EXPLORER_NILE_BASE_URL,
      [Network.Shasta]: process.env.EXPLORER_SHASTA_BASE_URL,
    },
  },
};

export type Config = Infer<typeof ConfigStruct>;

/**
 * The type of the tron snap's configuration provider, for dependency
 * injection and test doubles.
 */
export type ConfigProvider = BaseConfigProvider<typeof ConfigStruct>;

/**
 * The configuration provider of the snap.
 * The environment is parsed and the config built exactly once, when this
 * module is imported.
 *
 * @example
 * const { activeNetworks } = configProvider.config;
 */
export const configProvider = new BaseConfigProvider(ENVIRONMENT, ConfigStruct);
