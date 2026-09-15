/* eslint-disable n/no-process-env -- Environment fixtures. */
import { assert } from '@metamask/utils';

import { ConfigProvider } from './ConfigProvider';

const VALID_ENVIRONMENT = {
  ENVIRONMENT: 'production',
  LOG_LEVEL: 'error',
  RPC_URL_LIST_MAINNET: 'https://api.trongrid.io',
  RPC_URL_LIST_NILE_TESTNET: 'https://nile.trongrid.io',
  RPC_URL_LIST_SHASTA_TESTNET: 'https://api.shasta.trongrid.io/jsonrpc',
  EXPLORER_MAINNET_BASE_URL: 'https://tronscan.org',
  EXPLORER_NILE_BASE_URL: 'https://nile.tronscan.org',
  EXPLORER_SHASTA_BASE_URL: 'https://shasta.tronscan.org',
  PRICE_API_BASE_URL: 'https://price.api.cx.metamask.io',
  TOKEN_API_BASE_URL: 'https://tokens.api.cx.metamask.io',
  STATIC_API_BASE_URL: 'https://static.cx.metamask.io',
  SECURITY_ALERTS_API_BASE_URL: 'https://security-alerts.api.cx.metamask.io',
  NFT_API_BASE_URL: 'https://nft.api.cx.metamask.io',
  LOCAL_API_BASE_URL: 'http://localhost:8080',
  TRONGRID_BASE_URL_MAINNET: 'https://api.trongrid.io',
  TRONGRID_BASE_URL_NILE: 'https://nile.api.trongrid.io',
  TRONGRID_BASE_URL_SHASTA: 'https://shasta.api.trongrid.io',
  TRON_HTTP_BASE_URL_MAINNET: 'https://api.trongrid.io',
  TRON_HTTP_BASE_URL_NILE: 'https://nile.trongrid.io',
  TRON_HTTP_BASE_URL_SHASTA: 'https://shasta.trongrid.io',
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
});
