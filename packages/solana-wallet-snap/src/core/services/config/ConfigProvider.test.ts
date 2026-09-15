import { Network, Networks } from '../../constants/solana';
import { getClientStatus } from '../../utils/interface';
import { ConfigProvider } from './ConfigProvider';

jest.mock('../../utils/interface', () => ({
  getClientStatus: jest.fn(),
}));

const mockGetClientStatus = jest.mocked(getClientStatus);

/**
 * The same environment variables consumed before the shared `BaseConfigProvider`
 * was adopted. Constants mirrored from the module-level `ENVIRONMENT`.
 */
const FULL_ENVIRONMENT = {
  environment: 'production',
  logLevel: 'error',
  networks: [
    {
      ...Networks[Network.Mainnet],
      rpcUrls: 'https://api.mainnet-beta.solana.com',
      webSocketUrl: 'wss://api.mainnet-beta.solana.com',
    },
    {
      ...Networks[Network.Devnet],
      rpcUrls: 'https://api.devnet.solana.com',
      webSocketUrl: 'wss://api.devnet.solana.com',
    },
    {
      ...Networks[Network.Testnet],
      rpcUrls: 'https://api.testnet.solana.com',
      webSocketUrl: 'wss://api.testnet.solana.com',
    },
    {
      ...Networks[Network.Localnet],
      rpcUrls: 'http://localhost:8899',
      webSocketUrl: 'wss://localhost:8899',
    },
  ],
  explorerBaseUrl: 'https://solscan.io',
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
  subscriptions: {
    maxReconnectAttempts: 5,
    reconnectDelayMilliseconds: 1_000,
    closeConnectionsGracePeriodMilliseconds: 300_000,
  },
};

describe('ConfigProvider', () => {
  it('builds the exact same config as before the shared BaseConfigProvider', () => {
    const { config } = new ConfigProvider(FULL_ENVIRONMENT);

    expect(config).toStrictEqual({
      environment: 'production',
      logLevel: 'error',
      networks: [
        {
          ...Networks[Network.Mainnet],
          caip2Id: Network.Mainnet,
          rpcUrls: ['https://api.mainnet-beta.solana.com'],
          webSocketUrl: 'wss://api.mainnet-beta.solana.com',
        },
        {
          ...Networks[Network.Devnet],
          caip2Id: Network.Devnet,
          rpcUrls: ['https://api.devnet.solana.com'],
          webSocketUrl: 'wss://api.devnet.solana.com',
        },
        {
          ...Networks[Network.Testnet],
          caip2Id: Network.Testnet,
          rpcUrls: ['https://api.testnet.solana.com'],
          webSocketUrl: 'wss://api.testnet.solana.com',
        },
        {
          ...Networks[Network.Localnet],
          caip2Id: Network.Localnet,
          rpcUrls: ['http://localhost:8899'],
          webSocketUrl: 'wss://localhost:8899',
        },
      ],
      explorerBaseUrl: 'https://solscan.io',
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
      subscriptions: {
        maxReconnectAttempts: 5,
        reconnectDelayMilliseconds: 1_000,
        closeConnectionsGracePeriodMilliseconds: 300_000,
      },
    });
  });

  it('resolves the API base URLs the same way for test builds, where `snap.config.ts` inlines the local gateway', () => {
    const { config } = new ConfigProvider({
      ...FULL_ENVIRONMENT,
      environment: 'test',
      priceApi: {
        ...FULL_ENVIRONMENT.priceApi,
        baseUrl: 'http://localhost:8080',
      },
      tokenApi: {
        ...FULL_ENVIRONMENT.tokenApi,
        baseUrl: 'http://localhost:8080',
      },
      securityAlertsApi: {
        ...FULL_ENVIRONMENT.securityAlertsApi,
        baseUrl: 'http://localhost:8080',
      },
      nftApi: {
        ...FULL_ENVIRONMENT.nftApi,
        baseUrl: 'http://localhost:8080',
      },
    });

    expect(config.environment).toBe('test');
    expect(config.priceApi.baseUrl).toBe('http://localhost:8080');
    expect(config.tokenApi.baseUrl).toBe('http://localhost:8080');
    expect(config.securityAlertsApi.baseUrl).toBe('http://localhost:8080');
    expect(config.nftApi.baseUrl).toBe('http://localhost:8080');
  });

  it('splits comma-separated RPC URL lists', () => {
    const { config } = new ConfigProvider({
      ...FULL_ENVIRONMENT,
      networks: FULL_ENVIRONMENT.networks.map((network, index) => ({
        ...network,
        rpcUrls:
          index === 0
            ? 'https://rpc-one.com,https://rpc-two.com'
            : network.rpcUrls,
      })),
    });

    expect(config.networks[0]?.rpcUrls).toStrictEqual([
      'https://rpc-one.com',
      'https://rpc-two.com',
    ]);
  });

  it('looks up a network by any property', () => {
    const configProvider = new ConfigProvider(FULL_ENVIRONMENT);

    const network = configProvider.getNetworkBy('caip2Id', Network.Mainnet);

    expect(network.caip2Id).toBe(Network.Mainnet);
    expect(network.rpcUrls).toStrictEqual([
      'https://api.mainnet-beta.solana.com',
    ]);
  });

  it('looks up a network by WebSocket URL prefix match through the service', () => {
    const configProvider = new ConfigProvider(FULL_ENVIRONMENT);

    const network = configProvider.getNetworkBy(
      'webSocketUrl',
      'wss://api.devnet.solana.com',
    );

    expect(network.caip2Id).toBe(Network.Devnet);
  });

  it('throws when looking up an unknown network', () => {
    const configProvider = new ConfigProvider(FULL_ENVIRONMENT);

    expect(() => configProvider.getNetworkBy('caip2Id', 'unknown')).toThrow(
      'Network caip2Id not found',
    );
  });

  it('throws when the environment does not match the struct', () => {
    expect(
      () =>
        new ConfigProvider({
          ...FULL_ENVIRONMENT,
          networks: FULL_ENVIRONMENT.networks.map((network) => ({
            ...network,
            rpcUrls: 'not-a-url',
          })),
        }),
    ).toThrow('Invalid environment configuration');
  });

  it('derives the active networks from the config', async () => {
    mockGetClientStatus.mockResolvedValue({
      clientVersion: '12.11.1',
    } as Awaited<ReturnType<typeof getClientStatus>>);

    const networks = await new ConfigProvider({
      ...FULL_ENVIRONMENT,
      environment: 'test',
    }).getActiveNetworks();

    expect(networks).toStrictEqual([Network.Mainnet, Network.Localnet]);
  });
});
