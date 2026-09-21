import { BaseConfigProvider } from '@metamask/snap-networks-utils';

import { Network } from '../../constants';
import { ConfigStruct } from './ConfigProvider';

/**
 * The same environment variables consumed before the shared
 * `BaseConfigProvider` was adopted. Constants mirrored from the module-level
 * `ENVIRONMENT`.
 */
const VALID_ENVIRONMENT = {
  environment: 'production',
  logLevel: 'error',
  activeNetworks: [Network.Mainnet],
  priceApi: {
    baseUrl: 'https://price.api.cx.metamask.io',
    chunkSize: 50,
    cacheTtlsMilliseconds: {
      spotPrices: 60_000,
    },
  },
  tokenApi: {
    baseUrl: 'https://tokens.api.cx.metamask.io',
    chunkSize: 50,
  },
  staticApi: {
    baseUrl: 'https://static.cx.metamask.io',
  },
  securityAlertsApi: {
    baseUrl: 'https://security-alerts.api.cx.metamask.io',
  },
  trongridApi: {
    baseUrls: {
      [Network.Mainnet]: 'https://api.trongrid.io',
      [Network.Nile]: 'https://nile.api.trongrid.io',
      [Network.Shasta]: 'https://shasta.api.trongrid.io',
    },
  },
  tronHttpApi: {
    baseUrls: {
      [Network.Mainnet]: 'https://api.trongrid.io',
      [Network.Nile]: 'https://nile.trongrid.io',
      [Network.Shasta]: 'https://shasta.trongrid.io',
    },
  },
  explorerApi: {
    baseUrls: {
      [Network.Mainnet]: 'https://tronscan.org',
      [Network.Nile]: 'https://nile.tronscan.org',
      [Network.Shasta]: 'https://shasta.tronscan.org',
    },
  },
};

describe('ConfigProvider', () => {
  it('builds the exact same config as before the shared BaseConfigProvider', () => {
    const { config } = new BaseConfigProvider(VALID_ENVIRONMENT, ConfigStruct);

    expect(config).toStrictEqual({
      environment: 'production',
      logLevel: 'error',
      activeNetworks: [Network.Mainnet],
      priceApi: {
        baseUrl: 'https://price.api.cx.metamask.io',
        chunkSize: 50,
        cacheTtlsMilliseconds: {
          spotPrices: 60_000,
        },
      },
      tokenApi: {
        baseUrl: 'https://tokens.api.cx.metamask.io',
        chunkSize: 50,
      },
      staticApi: {
        baseUrl: 'https://static.cx.metamask.io',
      },
      securityAlertsApi: {
        baseUrl: 'https://security-alerts.api.cx.metamask.io',
      },
      trongridApi: {
        baseUrls: {
          [Network.Mainnet]: 'https://api.trongrid.io',
          [Network.Nile]: 'https://nile.api.trongrid.io',
          [Network.Shasta]: 'https://shasta.api.trongrid.io',
        },
      },
      tronHttpApi: {
        baseUrls: {
          [Network.Mainnet]: 'https://api.trongrid.io',
          [Network.Nile]: 'https://nile.trongrid.io',
          [Network.Shasta]: 'https://shasta.trongrid.io',
        },
      },
      explorerApi: {
        baseUrls: {
          [Network.Mainnet]: 'https://tronscan.org',
          [Network.Nile]: 'https://nile.tronscan.org',
          [Network.Shasta]: 'https://shasta.tronscan.org',
        },
      },
    });
  });

  it('resolves the API base URLs the same way for test builds, where `snap.config.ts` inlines the local gateway', () => {
    const localGateway = 'http://localhost:8080';
    const { config } = new BaseConfigProvider(
      {
        ...VALID_ENVIRONMENT,
        environment: 'test',
        priceApi: {
          ...VALID_ENVIRONMENT.priceApi,
          baseUrl: localGateway,
        },
        tokenApi: {
          ...VALID_ENVIRONMENT.tokenApi,
          baseUrl: localGateway,
        },
        securityAlertsApi: {
          ...VALID_ENVIRONMENT.securityAlertsApi,
          baseUrl: localGateway,
        },
      },
      ConfigStruct,
    );

    expect(config.environment).toBe('test');
    expect(config.priceApi.baseUrl).toBe(localGateway);
    expect(config.tokenApi.baseUrl).toBe(localGateway);
    expect(config.securityAlertsApi.baseUrl).toBe(localGateway);
  });

  it('falls back to the default API base URLs when the environment variables are unset', () => {
    const { config } = new BaseConfigProvider(
      {
        ...VALID_ENVIRONMENT,
        priceApi: {
          ...VALID_ENVIRONMENT.priceApi,
          baseUrl: undefined,
        },
        tokenApi: {
          ...VALID_ENVIRONMENT.tokenApi,
          baseUrl: undefined,
        },
        staticApi: {
          baseUrl: undefined,
        },
      },
      ConfigStruct,
    );

    expect(config.priceApi.baseUrl).toBe('https://price.api.cx.metamask.io');
    expect(config.tokenApi.baseUrl).toBe('https://tokens.api.cx.metamask.io');
    expect(config.staticApi.baseUrl).toBe('https://static.cx.metamask.io');
  });

  it('falls back to the default API base URLs when the environment variables are empty strings', () => {
    const { config } = new BaseConfigProvider(
      {
        ...VALID_ENVIRONMENT,
        priceApi: {
          ...VALID_ENVIRONMENT.priceApi,
          baseUrl: '',
        },
        tokenApi: {
          ...VALID_ENVIRONMENT.tokenApi,
          baseUrl: '',
        },
        staticApi: {
          baseUrl: '',
        },
      },
      ConfigStruct,
    );

    expect(config.priceApi.baseUrl).toBe('https://price.api.cx.metamask.io');
    expect(config.tokenApi.baseUrl).toBe('https://tokens.api.cx.metamask.io');
    expect(config.staticApi.baseUrl).toBe('https://static.cx.metamask.io');
  });

  it('throws when the environment does not match the struct', () => {
    expect(
      () =>
        new BaseConfigProvider(
          {
            ...VALID_ENVIRONMENT,
            trongridApi: {
              baseUrls: {
                ...VALID_ENVIRONMENT.trongridApi.baseUrls,
                [Network.Mainnet]: 'not-a-url',
              },
            },
          },
          ConfigStruct,
        ),
    ).toThrow('Invalid environment configuration');
  });
});
