import { TronWeb } from 'tronweb';

import { Network } from '../../constants';
import type { ConfigProvider } from '../../services/config';
import { TronWebFactory } from './TronWebFactory';

/**
 * A valid private key for tests. Only used to verify that the factory
 * forwards it to the created client, never to sign anything.
 */
const PRIVATE_KEY = String(TronWeb.createRandom().privateKey).replace(
  /^0x/u,
  '',
);

const MAINNET_URL = 'https://api.trongrid.io';
const NILE_URL = 'https://nile.api.trongrid.io';
const SHASTA_URL = 'https://shasta.api.trongrid.io';

/**
 * The `trongridApi` base URLs, mirroring what `ConfigProvider` builds from
 * the environment.
 */
const BASE_URLS = {
  [Network.Mainnet]: MAINNET_URL,
  [Network.Nile]: NILE_URL,
  [Network.Shasta]: SHASTA_URL,
};

/**
 * A minimal `ConfigProvider` test double.
 *
 * @param baseUrls - The `trongridApi` base URLs for the config to contain.
 * @returns The provider to inject into the factory.
 */
function createConfigProvider(
  baseUrls: Partial<Record<Network, string>> = BASE_URLS,
): ConfigProvider {
  return {
    config: { trongridApi: { baseUrls } },
  } as ConfigProvider;
}

describe('TronWebFactory', () => {
  describe('createClient', () => {
    it('reads the trongrid base URL for the requested network from the config provider', () => {
      const configProvider = createConfigProvider();
      const factory = new TronWebFactory({ configProvider });

      expect(factory.createClient(Network.Mainnet).fullNode?.host).toBe(
        MAINNET_URL,
      );
      expect(factory.createClient(Network.Nile).fullNode?.host).toBe(NILE_URL);
      expect(factory.createClient(Network.Shasta).fullNode?.host).toBe(
        SHASTA_URL,
      );
    });

    it('configures the full host for all node providers', () => {
      const configProvider = createConfigProvider();
      const factory = new TronWebFactory({ configProvider });

      const client = factory.createClient(Network.Mainnet);

      expect(client.fullNode?.host).toBe(MAINNET_URL);
      expect(client.solidityNode?.host).toBe(MAINNET_URL);
      expect(client.eventServer?.host).toBe(MAINNET_URL);
    });

    it('reads the config on every call, picking up new config values', () => {
      const configProvider = createConfigProvider();
      const factory = new TronWebFactory({ configProvider });

      const initialClient = factory.createClient(Network.Mainnet);
      expect(initialClient.fullNode?.host).toBe(MAINNET_URL);

      const newUrl = 'https://new-gateway.example.com';
      configProvider.config.trongridApi = {
        baseUrls: {
          ...BASE_URLS,
          [Network.Mainnet]: newUrl,
        },
      };

      const newClient = factory.createClient(Network.Mainnet);
      expect(newClient.fullNode?.host).toBe(newUrl);
    });

    it('throws when the config has no base URL for the requested network', () => {
      const configProvider = createConfigProvider({
        [Network.Mainnet]: MAINNET_URL,
      });
      const factory = new TronWebFactory({ configProvider });

      expect(() => factory.createClient(Network.Nile)).toThrow(
        `No configuration found for network: ${Network.Nile}`,
      );
    });

    it('sets the private key on the client when provided', () => {
      const configProvider = createConfigProvider();
      const factory = new TronWebFactory({ configProvider });

      const client = factory.createClient(Network.Mainnet, PRIVATE_KEY);

      expect(client.defaultPrivateKey).toBe(PRIVATE_KEY);
    });

    it('does not set a private key on the client when omitted', () => {
      const configProvider = createConfigProvider();
      const factory = new TronWebFactory({ configProvider });

      const client = factory.createClient(Network.Mainnet);

      expect(client.defaultPrivateKey).toBe(false);
    });

    it('creates a fresh client instance on every call', () => {
      const configProvider = createConfigProvider();
      const factory = new TronWebFactory({ configProvider });

      const firstClient = factory.createClient(Network.Mainnet, PRIVATE_KEY);
      const secondClient = factory.createClient(Network.Mainnet, PRIVATE_KEY);

      expect(secondClient).not.toBe(firstClient);
      expect(secondClient).toBeInstanceOf(TronWeb);
    });
  });
});
