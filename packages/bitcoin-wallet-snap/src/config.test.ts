import { LogLevel } from '@metamask/snap-networks-utils';
import { BaseConfigProvider } from '@metamask/snap-networks-utils';

import { ConfigStruct } from './config';

/**
 * The same environment variables consumed before the shared
 * `BaseConfigProvider` was adopted. Constants mirrored from the module-level
 * `ENVIRONMENT`.
 */
const FULL_ENVIRONMENT = {
  logLevel: 'debug',
  defaultAddressType: 'p2tr',
  encrypt: false,
  chain: {
    parallelRequests: 5,
    stopGap: { discovery: 5, scan: 20 },
    maxRetries: 3,
    url: {
      bitcoin: 'https://esplora.example.com/api',
      testnet: 'https://esplora.example.com/testnet/api',
      testnet4: 'https://esplora.example.com/testnet4/api',
      signet: 'https://esplora.example.com/signet/api',
      regtest: 'https://esplora.example.com/regtest/api',
    },
    explorerUrl: {
      bitcoin: 'https://explorer.example.com',
      testnet: 'https://explorer.example.com/testnet',
      testnet4: 'https://explorer.example.com/testnet4',
      signet: 'https://explorer.example.com/signet',
      regtest: 'https://explorer.example.com/regtest',
    },
  },
  targetBlocksConfirmation: 1,
  fallbackFeeRate: 5.0,
  ratesRefreshInterval: 'PT20S',
  priceApi: {
    url: 'https://price.example.com',
  },
};

describe('ConfigProvider', () => {
  it('builds the exact same config as before the shared BaseConfigProvider', () => {
    const { config } = new BaseConfigProvider(FULL_ENVIRONMENT, ConfigStruct);

    expect(config).toStrictEqual({
      logLevel: 'debug',
      encrypt: false,
      chain: {
        parallelRequests: 5,
        stopGap: { discovery: 5, scan: 20 },
        maxRetries: 3,
        url: {
          bitcoin: 'https://esplora.example.com/api',
          testnet: 'https://esplora.example.com/testnet/api',
          testnet4: 'https://esplora.example.com/testnet4/api',
          signet: 'https://esplora.example.com/signet/api',
          regtest: 'https://esplora.example.com/regtest/api',
        },
        explorerUrl: {
          bitcoin: 'https://explorer.example.com',
          testnet: 'https://explorer.example.com/testnet',
          testnet4: 'https://explorer.example.com/testnet4',
          signet: 'https://explorer.example.com/signet',
          regtest: 'https://explorer.example.com/regtest',
        },
      },
      targetBlocksConfirmation: 1,
      fallbackFeeRate: 5.0,
      ratesRefreshInterval: 'PT20S',
      priceApi: {
        url: 'https://price.example.com',
      },
      defaultAddressType: 'p2tr',
    });
  });

  it('falls back to the same defaults for unset and empty environment variables', () => {
    const { config } = new BaseConfigProvider(
      {
        ...FULL_ENVIRONMENT,
        logLevel: '',
        defaultAddressType: '',
        chain: {
          ...FULL_ENVIRONMENT.chain,
          url: {
            bitcoin: '',
            testnet: undefined,
            testnet4: '',
            signet: '',
            regtest: '',
          },
          explorerUrl: {
            bitcoin: '',
            testnet: '',
            testnet4: '',
            signet: '',
            regtest: '',
          },
        },
        priceApi: {
          url: '',
        },
      },
      ConfigStruct,
    );

    expect(config.logLevel).toBe(LogLevel.SILENT);
    expect(config.defaultAddressType).toBe('p2wpkh');
    expect(config.chain.url.bitcoin).toBe('https://blockstream.info/api');
    expect(config.chain.url.testnet).toBe(
      'https://blockstream.info/testnet/api',
    );
    expect(config.chain.url.signet).toBe('https://mutinynet.com/api');
    expect(config.chain.explorerUrl.bitcoin).toBe('https://mempool.space');
    expect(config.priceApi.url).toBe('https://price.api.cx.metamask.io');
  });

  it('throws when the environment does not match the struct', () => {
    expect(
      () =>
        new BaseConfigProvider(
          {
            ...FULL_ENVIRONMENT,
            chain: {
              ...FULL_ENVIRONMENT.chain,
              url: {
                ...FULL_ENVIRONMENT.chain.url,
                bitcoin: 'not-a-url',
              },
            },
          },
          ConfigStruct,
        ),
    ).toThrow('Invalid environment configuration');
  });
});
