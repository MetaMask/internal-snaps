/* eslint-disable n/no-process-env -- Environment fixtures. */
import { assert } from '@metamask/utils';

import { Network } from '../../constants/solana';
import { getClientStatus } from '../../utils/interface';
import { ConfigProvider } from './ConfigProvider';

jest.mock('../../utils/interface', () => ({
  getClientStatus: jest.fn(),
}));

const mockGetClientStatus = jest.mocked(getClientStatus);

const VALID_ENVIRONMENT = {
  ENVIRONMENT: 'production',
  LOG_LEVEL: 'error',
  RPC_URL_MAINNET_LIST: 'https://api.mainnet-beta.solana.com',
  RPC_URL_DEVNET_LIST: 'https://api.devnet.solana.com',
  RPC_URL_TESTNET_LIST: 'https://api.testnet.solana.com',
  RPC_URL_LOCALNET_LIST: 'http://localhost:8899',
  RPC_WEB_SOCKET_URL_MAINNET: 'wss://api.mainnet-beta.solana.com',
  RPC_WEB_SOCKET_URL_DEVNET: 'wss://api.devnet.solana.com',
  RPC_WEB_SOCKET_URL_TESTNET: 'wss://api.testnet.solana.com',
  RPC_WEB_SOCKET_URL_LOCALNET: 'wss://localhost:8899',
  EXPLORER_BASE_URL: 'https://solscan.io',
  PRICE_API_BASE_URL: 'https://price.api.cx.metamask.io',
  TOKEN_API_BASE_URL: 'https://tokens.api.cx.metamask.io',
  STATIC_API_BASE_URL: 'https://static.cx.metamask.io',
  SECURITY_ALERTS_API_BASE_URL: 'https://security-alerts.api.cx.metamask.io',
  NFT_API_BASE_URL: 'https://nft.api.cx.metamask.io',
  LOCAL_API_BASE_URL: 'http://localhost:8080',
};

/**
 * Run a test case with a valid environment plus overrides, restoring the
 * previous `process.env` values afterwards.
 *
 * @param overrides - Environment variables to set on top of the valid
 * environment.
 * @param run - The test case body.
 */
const withEnvironment = async (
  overrides: Record<string, string>,
  run: () => void | Promise<void>,
): Promise<void> => {
  const merged = { ...VALID_ENVIRONMENT, ...overrides };
  const original = new Map(
    Object.keys(merged).map((key) => [key, process.env[key]]),
  );

  for (const [key, value] of Object.entries(merged)) {
    process.env[key] = value;
  }

  try {
    await run();
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

describe('ConfigProvider', () => {
  it('looks up a network by any property', async () => {
    await withEnvironment({}, () => {
      const configProvider = new ConfigProvider();
      const [network] = configProvider.get().networks;

      assert(network !== undefined);

      expect(configProvider.getNetworkBy('caip2Id', network.caip2Id)).toBe(
        network,
      );
    });
  });

  it('throws when looking up an unknown network', async () => {
    await withEnvironment({}, () => {
      const configProvider = new ConfigProvider();

      expect(() => configProvider.getNetworkBy('caip2Id', 'unknown')).toThrow(
        'Network caip2Id not found',
      );
    });
  });

  it('derives the active networks from the config', async () => {
    mockGetClientStatus.mockResolvedValue({
      clientVersion: '12.11.1',
    } as Awaited<ReturnType<typeof getClientStatus>>);

    await withEnvironment({ ENVIRONMENT: 'test' }, async () => {
      const networks = await new ConfigProvider().getActiveNetworks();

      expect(networks).toStrictEqual([Network.Mainnet, Network.Localnet]);
    });
  });
});
