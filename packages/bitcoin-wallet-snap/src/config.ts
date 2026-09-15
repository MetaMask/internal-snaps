/* eslint-disable no-restricted-globals */

import type { AddressType } from '@metamask/bitcoindevkit';
import {
  BaseConfigProvider,
  LogLevelStruct,
  UrlStruct,
  emptyToUndefined,
  parseEnv,
} from '@metamask/snap-networks-utils';
import type { Infer } from '@metamask/superstruct';
import { enums, object } from '@metamask/superstruct';

import type { SnapConfig } from './entities';

const ADDRESS_TYPES: [AddressType, ...AddressType[]] = [
  'p2pkh',
  'p2sh',
  'p2wpkh',
  'p2wsh',
  'p2tr',
];

const EnvStruct = object({
  LOG_LEVEL: LogLevelStruct,
  DEFAULT_ADDRESS_TYPE: emptyToUndefined(enums(ADDRESS_TYPES)),
  ESPLORA_BITCOIN: emptyToUndefined(UrlStruct),
  ESPLORA_TESTNET: emptyToUndefined(UrlStruct),
  ESPLORA_TESTNET4: emptyToUndefined(UrlStruct),
  ESPLORA_SIGNET: emptyToUndefined(UrlStruct),
  ESPLORA_REGTEST: emptyToUndefined(UrlStruct),
  PRICE_API_URL: emptyToUndefined(UrlStruct),
  BITCOIN_EXPLORER: emptyToUndefined(UrlStruct),
  TESTNET_EXPLORER: emptyToUndefined(UrlStruct),
  TESTNET4_EXPLORER: emptyToUndefined(UrlStruct),
  SIGNET_EXPLORER: emptyToUndefined(UrlStruct),
  REGTEST_EXPLORER: emptyToUndefined(UrlStruct),
});

type Env = Infer<typeof EnvStruct>;

/**
 * A utility class that provides the configuration of the snap.
 *
 * @example
 * const config = configProvider.get();
 */
export class ConfigProvider extends BaseConfigProvider<Env, SnapConfig> {
  protected parseEnvironment(): Env {
    return parseEnv(
      {
        LOG_LEVEL: process.env.LOG_LEVEL,
        DEFAULT_ADDRESS_TYPE: process.env.DEFAULT_ADDRESS_TYPE,
        ESPLORA_BITCOIN: process.env.ESPLORA_BITCOIN,
        ESPLORA_TESTNET: process.env.ESPLORA_TESTNET,
        ESPLORA_TESTNET4: process.env.ESPLORA_TESTNET4,
        ESPLORA_SIGNET: process.env.ESPLORA_SIGNET,
        ESPLORA_REGTEST: process.env.ESPLORA_REGTEST,
        PRICE_API_URL: process.env.PRICE_API_URL,
        BITCOIN_EXPLORER: process.env.BITCOIN_EXPLORER,
        TESTNET_EXPLORER: process.env.TESTNET_EXPLORER,
        TESTNET4_EXPLORER: process.env.TESTNET4_EXPLORER,
        SIGNET_EXPLORER: process.env.SIGNET_EXPLORER,
        REGTEST_EXPLORER: process.env.REGTEST_EXPLORER,
      },
      EnvStruct,
    );
  }

  protected buildConfig(environment: Env): SnapConfig {
    return {
      logLevel: environment.LOG_LEVEL,
      encrypt: false,
      chain: {
        parallelRequests: 5,
        stopGap: { discovery: 5, scan: 20 },
        maxRetries: 3,
        url: {
          bitcoin:
            environment.ESPLORA_BITCOIN ?? 'https://blockstream.info/api',
          testnet:
            environment.ESPLORA_TESTNET ??
            'https://blockstream.info/testnet/api',
          testnet4:
            environment.ESPLORA_TESTNET4 ??
            'https://mempool.space/testnet4/api/v1',
          signet: environment.ESPLORA_SIGNET ?? 'https://mutinynet.com/api',
          regtest:
            environment.ESPLORA_REGTEST ?? 'http://localhost:8094/regtest/api',
        },
        explorerUrl: {
          bitcoin: environment.BITCOIN_EXPLORER ?? 'https://mempool.space',
          testnet:
            environment.TESTNET_EXPLORER ?? 'https://mempool.space/testnet',
          testnet4:
            environment.TESTNET4_EXPLORER ?? 'https://mempool.space/testnet4',
          signet: environment.SIGNET_EXPLORER ?? 'https://mutinynet.com',
          regtest:
            environment.REGTEST_EXPLORER ?? 'http://localhost:8094/regtest',
        },
      },
      targetBlocksConfirmation: 1,
      fallbackFeeRate: 5.0,
      ratesRefreshInterval: 'PT20S',
      priceApi: {
        url: environment.PRICE_API_URL ?? 'https://price.api.cx.metamask.io',
      },
      defaultAddressType:
        environment.DEFAULT_ADDRESS_TYPE ?? ('p2wpkh' as AddressType),
    };
  }
}

/**
 * The configuration provider of the snap.
 * The environment is parsed and the config built exactly once, when this
 * module is imported.
 */
export const configProvider = new ConfigProvider();
