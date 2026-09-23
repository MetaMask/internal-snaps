/* eslint-disable no-restricted-globals */

import type { AddressType } from '@metamask/bitcoindevkit';
import {
  BaseConfigProvider,
  defaultedUrlStruct,
  LogLevelStruct,
} from '@metamask/snap-networks-utils';
import type { Infer } from '@metamask/superstruct';
import {
  boolean,
  coerce,
  defaulted,
  enums,
  number,
  object,
  string,
} from '@metamask/superstruct';

const ADDRESS_TYPES: [AddressType, ...AddressType[]] = [
  'p2pkh',
  'p2sh',
  'p2wpkh',
  'p2wsh',
  'p2tr',
];

export const ConfigStruct = object({
  logLevel: LogLevelStruct,
  encrypt: boolean(),
  chain: object({
    parallelRequests: number(),
    stopGap: object({
      discovery: number(),
      scan: number(),
    }),
    maxRetries: number(),
    url: object({
      bitcoin: defaultedUrlStruct('https://blockstream.info/api'),
      testnet: defaultedUrlStruct('https://blockstream.info/testnet/api'),
      testnet4: defaultedUrlStruct('https://mempool.space/testnet4/api/v1'),
      signet: defaultedUrlStruct('https://mutinynet.com/api'),
      regtest: defaultedUrlStruct('http://localhost:8094/regtest/api'),
    }),
    explorerUrl: object({
      bitcoin: defaultedUrlStruct('https://mempool.space'),
      testnet: defaultedUrlStruct('https://mempool.space/testnet'),
      testnet4: defaultedUrlStruct('https://mempool.space/testnet4'),
      signet: defaultedUrlStruct('https://mutinynet.com'),
      regtest: defaultedUrlStruct('http://localhost:8094/regtest'),
    }),
  }),
  targetBlocksConfirmation: number(),
  fallbackFeeRate: number(),
  ratesRefreshInterval: string(),
  priceApi: object({
    url: defaultedUrlStruct('https://price.api.cx.metamask.io'),
  }),
  defaultAddressType: coerce(
    defaulted(enums(ADDRESS_TYPES), 'p2wpkh'),
    string(),
    (value: string) => (value === '' ? undefined : value),
  ),
});

/**
 * The environment consumed by the snap. Each `process.env` reference is
 * replaced with its build-time value (see `snap.config.ts`).
 */
export const ENVIRONMENT = {
  logLevel: process.env.LOG_LEVEL,
  defaultAddressType: process.env.DEFAULT_ADDRESS_TYPE,
  encrypt: false,
  chain: {
    parallelRequests: 5,
    stopGap: { discovery: 5, scan: 20 },
    maxRetries: 3,
    url: {
      bitcoin: process.env.ESPLORA_BITCOIN,
      testnet: process.env.ESPLORA_TESTNET,
      testnet4: process.env.ESPLORA_TESTNET4,
      signet: process.env.ESPLORA_SIGNET,
      regtest: process.env.ESPLORA_REGTEST,
    },
    explorerUrl: {
      bitcoin: process.env.BITCOIN_EXPLORER,
      testnet: process.env.TESTNET_EXPLORER,
      testnet4: process.env.TESTNET4_EXPLORER,
      signet: process.env.SIGNET_EXPLORER,
      regtest: process.env.REGTEST_EXPLORER,
    },
  },
  targetBlocksConfirmation: 1,
  fallbackFeeRate: 5.0,
  ratesRefreshInterval: 'PT20S',
  priceApi: {
    url: process.env.PRICE_API_URL,
  },
};

export type Config = Infer<typeof ConfigStruct>;

/**
 * The configuration provider of the snap.
 * The environment is parsed exactly once, when this module is imported.
 *
 * @example
 * const config = configProvider.config;
 */
export const configProvider = new BaseConfigProvider(ENVIRONMENT, ConfigStruct);
