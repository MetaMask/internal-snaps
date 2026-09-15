import { Network } from '../../constants';
import { ConfigProvider } from './ConfigProvider';

/**
 * The same environment variables consumed before the shared
 * `BaseConfigProvider` was adopted. Constants mirrored from the module-level
 * `ENVIRONMENT`.
 */
const VALID_ENVIRONMENT = {
  environment: 'production',
  logLevel: 'error',
  networks: [
    {
      caip2Id: Network.Mainnet,
      rpcUrls: 'https://api.trongrid.io',
      explorerBaseUrl: 'https://tronscan.org',
    },
    {
      caip2Id: Network.Nile,
      rpcUrls: 'https://nile.trongrid.io',
      explorerBaseUrl: 'https://nile.tronscan.org',
    },
    {
      caip2Id: Network.Shasta,
      rpcUrls: 'https://api.shasta.trongrid.io/jsonrpc',
      explorerBaseUrl: 'https://shasta.tronscan.org',
    },
  ],
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
  nftApi: {
    baseUrl: 'https://nft.api.cx.metamask.io',
    cacheTtlsMilliseconds: {
      listAddressSolanaNfts: 60_000,
      getNftMetadata: 60_000,
    },
  },
  transactions: {
    storageLimit: 10,
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
};

describe('ConfigProvider', () => {
  it('builds the exact same config as before the shared BaseConfigProvider', () => {
    const { config } = new ConfigProvider(VALID_ENVIRONMENT);

    expect(config).toStrictEqual({
      environment: 'production',
      logLevel: 'error',
      networks: [
        {
          caip2Id: Network.Mainnet,
          rpcUrls: ['https://api.trongrid.io'],
          explorerBaseUrl: 'https://tronscan.org',
        },
        {
          caip2Id: Network.Nile,
          rpcUrls: ['https://nile.trongrid.io'],
          explorerBaseUrl: 'https://nile.tronscan.org',
        },
        {
          caip2Id: Network.Shasta,
          rpcUrls: ['https://api.shasta.trongrid.io/jsonrpc'],
          explorerBaseUrl: 'https://shasta.tronscan.org',
        },
      ],
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
      nftApi: {
        baseUrl: 'https://nft.api.cx.metamask.io',
        cacheTtlsMilliseconds: {
          listAddressSolanaNfts: 60_000,
          getNftMetadata: 60_000,
        },
      },
      transactions: {
        storageLimit: 10,
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
    });
  });

  it('resolves the API base URLs the same way for test builds, where `snap.config.ts` inlines the local gateway', () => {
    const localGateway = 'http://localhost:8080';
    const { config } = new ConfigProvider({
      ...VALID_ENVIRONMENT,
      environment: 'test',
      activeNetworks: [Network.Mainnet],
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
      nftApi: {
        ...VALID_ENVIRONMENT.nftApi,
        baseUrl: localGateway,
      },
    });

    expect(config.environment).toBe('test');
    expect(config.priceApi.baseUrl).toBe(localGateway);
    expect(config.tokenApi.baseUrl).toBe(localGateway);
    expect(config.securityAlertsApi.baseUrl).toBe(localGateway);
    expect(config.nftApi.baseUrl).toBe(localGateway);
  });

  it('looks up a network by any property', () => {
    const configProvider = new ConfigProvider(VALID_ENVIRONMENT);

    const network = configProvider.getNetworkBy('caip2Id', Network.Mainnet);

    expect(network.caip2Id).toBe(Network.Mainnet);
    expect(network.rpcUrls).toStrictEqual(['https://api.trongrid.io']);
  });

  it('throws when looking up an unknown network', () => {
    const configProvider = new ConfigProvider(VALID_ENVIRONMENT);

    expect(() => configProvider.getNetworkBy('caip2Id', 'unknown')).toThrow(
      'Network caip2Id not found',
    );
  });

  it('throws when the environment does not match the struct', () => {
    expect(
      () =>
        new ConfigProvider({
          ...VALID_ENVIRONMENT,
          networks: VALID_ENVIRONMENT.networks.map((network) => ({
            ...network,
            rpcUrls: 'not-a-url',
          })),
        }),
    ).toThrow('Invalid environment configuration');
  });
});
