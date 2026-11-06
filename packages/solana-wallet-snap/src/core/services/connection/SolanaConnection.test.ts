import type { Serializable, ICache } from '@metamask/snap-networks-utils';
import { InMemoryCache } from '@metamask/snap-networks-utils';
import * as Token2022 from '@solana-program/token-2022';
import { fetchJsonParsedAccount } from '@solana/kit';
import * as SolanaKit from '@solana/kit';
import type { Mock } from 'vitest';

import { KnownCaip19Id, Network } from '../../constants/solana';
import { mockLogger } from '../__mocks__/logger';
import {
  MOCK_JSON_PARSED_ACCOUNT,
  MOCK_MINT_ACCOUNT,
} from '../__mocks__/mockSolanaRpcResponses';
import type { ConfigProvider } from '../config';
import { SolanaConnection } from './SolanaConnection';
import * as Transport from './transport';

const MOCK_NETWORKS = [
  {
    caip2Id: Network.Mainnet,
    rpcUrls: ['https://mainnet.com'],
  },
  {
    caip2Id: Network.Devnet,
    rpcUrls: ['https://devnet.com'],
  },
];

describe('SolanaConnection', () => {
  let connection: SolanaConnection;
  let mockConfigProvider: ConfigProvider;
  let mockCache: ICache<Serializable>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(SolanaKit, 'createSolanaRpcFromTransport').mockImplementation(
      ((transport: { urls: unknown }) => ({ urls: transport.urls })) as never,
    );
    vi.spyOn(SolanaKit, 'address').mockImplementation(
      ((value: unknown) => value) as never,
    );
    vi.spyOn(SolanaKit, 'fetchJsonParsedAccount');
    vi.spyOn(Token2022, 'fetchMint').mockResolvedValue(
      MOCK_MINT_ACCOUNT as never,
    );
    vi.spyOn(Transport, 'createMainTransport').mockImplementation(((
      urls: unknown,
    ) => ({ urls })) as never);

    mockConfigProvider = {
      config: {
        networks: MOCK_NETWORKS,
      },
      getNetworkBy: vi.fn().mockImplementation((key, value) => {
        switch (key) {
          case 'caip2Id':
            return MOCK_NETWORKS.find((network) => network.caip2Id === value);
          default:
            throw new Error('Implement the case.');
        }
      }),
    } as unknown as ConfigProvider;

    mockCache = new InMemoryCache(mockLogger);

    connection = new SolanaConnection(
      mockConfigProvider,
      mockCache,
      mockLogger,
    );
  });

  describe('getRpc', () => {
    it('returns the correct RPC client for a valid network', () => {
      const rpc = connection.getRpc(Network.Mainnet);
      expect(rpc).toBeDefined();
      expect(rpc).toStrictEqual({
        urls: ['https://mainnet.com'],
      });

      const rpcDevnet = connection.getRpc(Network.Devnet);
      expect(rpcDevnet).toBeDefined();
      expect(rpcDevnet).toStrictEqual({
        urls: ['https://devnet.com'],
      });
    });

    it('returns the same RPC client for the same network', () => {
      const rpc1 = connection.getRpc(Network.Mainnet);
      const rpc2 = connection.getRpc(Network.Mainnet);
      expect(rpc1).toBe(rpc2);
    });

    it('returns different RPC clients for different networks', () => {
      const rpc1 = connection.getRpc(Network.Mainnet);
      const rpc2 = connection.getRpc(Network.Devnet);
      expect(rpc1).not.toBe(rpc2);
    });

    it('throws an error for an invalid network', () => {
      expect(() => {
        connection.getRpc('invalid-network' as Network);
      }).toThrow(/Expected one of/u);
    });
  });

  describe('fetchJsonParsedAccount', () => {
    beforeEach(() => {
      vi.clearAllMocks();

      (fetchJsonParsedAccount as Mock).mockResolvedValue(
        MOCK_JSON_PARSED_ACCOUNT,
      );
    });

    it('returns the JSON-parsed account', async () => {
      const jsonParsedAccount = await connection.fetchJsonParsedAccount(
        KnownCaip19Id.UsdcMainnet,
        Network.Mainnet,
      );

      expect(jsonParsedAccount).toStrictEqual(MOCK_JSON_PARSED_ACCOUNT);
    });

    it('caches the JSON-parsed account', async () => {
      const call = async () =>
        connection.fetchJsonParsedAccount(
          KnownCaip19Id.UsdcMainnet,
          Network.Mainnet,
        );

      // Do the call twice in a row to test the cache
      await call();
      await call();

      // It should effectively call the RPC only once
      expect(fetchJsonParsedAccount).toHaveBeenCalledTimes(1);
    });

    it('bypasses the cache when skipCache is true', async () => {
      const call = async () =>
        connection.fetchJsonParsedAccount(
          KnownCaip19Id.UsdcMainnet,
          Network.Mainnet,
          undefined,
          { skipCache: true },
        );

      await call();
      await call();

      expect(fetchJsonParsedAccount).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchMint', () => {
    it('returns the mint account', async () => {
      const mint = await connection.fetchMint(
        KnownCaip19Id.UsdcMainnet,
        Network.Mainnet,
      );

      expect(mint).toStrictEqual(MOCK_MINT_ACCOUNT);
    });

    it('caches the mint account', async () => {
      const call = async () =>
        connection.fetchMint(KnownCaip19Id.UsdcMainnet, Network.Mainnet);

      await call();
      await call();

      expect(Token2022.fetchMint).toHaveBeenCalledTimes(1);
    });
  });
});
