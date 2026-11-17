import * as snapNetworksUtils from '@metamask/snap-networks-utils';
import { TronWeb } from 'tronweb';
import type { Types as TronwebTypes } from 'tronweb';

import { Network } from '../../constants';
import type { ConfigProvider } from '../../services/config';
import { fetchPolicyReporting } from '../../utils/analytics';
import { throwOnTransientBroadcastFailure } from '../../utils/broadcast';
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
  it('reports outages through the read and broadcast fetch policies of each network', () => {
    const createFetchPolicySpy = vi.spyOn(
      snapNetworksUtils,
      'createFetchPolicy',
    );

    expect(
      () => new TronWebFactory({ configProvider: createConfigProvider() }),
    ).not.toThrow();

    for (const network of Object.values(Network)) {
      for (const service of ['tronweb_provider', 'tronweb_broadcast']) {
        expect(createFetchPolicySpy).toHaveBeenCalledWith(
          expect.objectContaining({
            service,
            chainIdCaip: network,
            ...fetchPolicyReporting,
          }),
        );
      }
    }
  });

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

    it('sets a per-attempt timeout below the snap execution limit', () => {
      const factory = new TronWebFactory({
        configProvider: createConfigProvider(),
      });

      const client = factory.createClient(Network.Mainnet);

      expect(client.fullNode.timeout).toBe(10_000);
      expect(client.solidityNode.timeout).toBe(10_000);
      expect(client.eventServer?.timeout).toBe(10_000);
    });

    it('retries axios-style transient read failures', async () => {
      const factory = new TronWebFactory({
        configProvider: createConfigProvider(),
      });
      const operation = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(
          Object.assign(new Error('unavailable'), {
            response: { status: 503 },
          }),
        )
        .mockResolvedValue('ok');

      expect(await factory.executeRead(Network.Mainnet, operation)).toBe('ok');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('does not retry axios-style 404 read failures', async () => {
      const factory = new TronWebFactory({
        configProvider: createConfigProvider(),
      });
      const error = Object.assign(new Error('not found'), {
        response: { status: 404 },
      });
      const operation = vi.fn<() => Promise<string>>().mockRejectedValue(error);

      await expect(
        factory.executeRead(Network.Mainnet, operation),
      ).rejects.toMatchObject({ httpStatus: 404 });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('retries only the captured signed transaction broadcast', async () => {
      const factory = new TronWebFactory({
        configProvider: createConfigProvider(),
      });
      const signedTransaction = { txID: 'signed-transaction' };
      const sendRawTransaction = vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('unavailable'), {
            response: { status: 503 },
          }),
        )
        .mockResolvedValue({ result: true });
      const operation = vi.fn(() => sendRawTransaction(signedTransaction));

      await factory.executeBroadcast(Network.Mainnet, operation);

      expect(operation).toHaveBeenCalledTimes(2);
      expect(sendRawTransaction).toHaveBeenNthCalledWith(1, signedTransaction);
      expect(sendRawTransaction).toHaveBeenNthCalledWith(2, signedTransaction);
    });

    it('does not retry non-transient broadcast failures', async () => {
      const factory = new TronWebFactory({
        configProvider: createConfigProvider(),
      });
      const error = Object.assign(new Error('invalid transaction'), {
        response: { status: 400 },
      });
      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        factory.executeBroadcast(Network.Mainnet, operation),
      ).rejects.toMatchObject({ httpStatus: 400 });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('retries a resolved transient node response through the broadcast policy', async () => {
      const factory = new TronWebFactory({
        configProvider: createConfigProvider(),
      });
      const signedTransaction = { txID: 'signed-transaction' };
      const sendRawTransaction = vi
        .fn()
        .mockResolvedValueOnce({
          code: 'SERVER_BUSY',
          message: 'Server busy',
          result: false,
        })
        .mockResolvedValue({ result: true });
      const operation = async (): Promise<{ result: boolean }> =>
        throwOnTransientBroadcastFailure(
          await sendRawTransaction(signedTransaction),
        );

      await factory.executeBroadcast(Network.Mainnet, operation);

      expect(sendRawTransaction).toHaveBeenCalledTimes(2);
      expect(sendRawTransaction).toHaveBeenNthCalledWith(1, signedTransaction);
      expect(sendRawTransaction).toHaveBeenNthCalledWith(2, signedTransaction);
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

    it('preserves trailing slashes in provider URLs', () => {
      const url = 'https://tron-mainnet.infura.io/v3/project-id/';
      const factory = new TronWebFactory({
        configProvider: createConfigProvider({ [Network.Mainnet]: url }),
      });

      expect(factory.createClient(Network.Mainnet).fullNode?.host).toBe(url);
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

  describe('transaction deserialization', () => {
    const TEST_ADDRESS = TronWeb.address.fromHex(
      '41a614f803b6fd780986a42c78ec9c7f77e6ded13c',
    );

    const createClient = (): TronWeb => {
      const factory = new TronWebFactory({
        configProvider: createConfigProvider(),
      });
      const client = factory.createClient(Network.Mainnet);
      vi.spyOn(client.trx, 'getCurrentRefBlockParams').mockResolvedValue({
        ref_block_bytes: '0123',
        ref_block_hash: 'aabbccdd00112233',
        expiration: 123456,
        timestamp: 789,
      });
      return client;
    };

    const deserializeAndReserialize = (
      client: TronWeb,
      transaction: TronwebTypes.Transaction,
    ): string => {
      const [contract] = transaction.raw_data.contract;
      if (!contract) {
        throw new Error('Transaction has no contract');
      }
      const deserialized = client.utils.deserializeTx.deserializeTransaction(
        contract.type,
        transaction.raw_data_hex,
      );
      const transactionPb = client.utils.transaction.txJsonToPb({
        raw_data: deserialized,
      });
      return client.utils.transaction.txPbToRawDataHex(transactionPb);
    };

    it('supports VoteWitnessContract transactions', async () => {
      const client = createClient();
      const witness = TronWeb.address.fromHex(
        '41bace09b0c75ff01da2cb86cf05bc0d6d1af21f5d',
      );
      const transaction = await client.transactionBuilder.vote(
        { [witness]: 1 },
        TEST_ADDRESS,
      );

      expect(deserializeAndReserialize(client, transaction).toLowerCase()).toBe(
        transaction.raw_data_hex.toLowerCase(),
      );
    });

    it('supports AccountPermissionUpdateContract transactions', async () => {
      const client = createClient();
      const key = { address: TEST_ADDRESS, weight: 1 };
      const ownerPermission: TronwebTypes.Permission = {
        type: 0,
        id: 0,
        permission_name: 'owner',
        threshold: 1,
        keys: [key],
      };
      const activePermission: TronwebTypes.Permission = {
        type: 2,
        id: 2,
        permission_name: 'active',
        threshold: 1,
        operations:
          '7fff1fc0033e0000000000000000000000000000000000000000000000000000',
        keys: [key],
      };
      const transaction =
        await client.transactionBuilder.updateAccountPermissions(
          TEST_ADDRESS,
          ownerPermission,
          null,
          [activePermission],
        );

      expect(deserializeAndReserialize(client, transaction).toLowerCase()).toBe(
        transaction.raw_data_hex.toLowerCase(),
      );
    });
  });
});
