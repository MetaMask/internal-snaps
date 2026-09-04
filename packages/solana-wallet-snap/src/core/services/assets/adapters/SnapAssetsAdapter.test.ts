import type { Serializable } from '@metamask/snap-networks-utils';
import { cloneDeep } from 'lodash';

import type { ICache } from '../../../caching/ICache';
import { InMemoryCache } from '../../../caching/InMemoryCache';
import { MOCK_NFTS_LIST_RESPONSE_MAPPED } from '../../../clients/nft-api/mocks/mockNftsListResponseMapped';
import type { NftApiClient } from '../../../clients/nft-api/NftApiClient';
import type { TokenApiClient } from '../../../clients/token-api-client/TokenApiClient';
import { Network } from '../../../constants/solana';
import {
  MOCK_ASSET_ENTITY_0,
  MOCK_ASSET_ENTITY_1,
  MOCK_ASSET_ENTITY_2,
} from '../../../test/mocks/asset-entities';
import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../../test/mocks/solana-keyring-accounts';
import { mockLogger } from '../../__mocks__/logger';
import { createMockConnection } from '../../__mocks__/mockConnection';
import { MOCK_SOLANA_RPC_GET_TOKEN_ACCOUNTS_BY_OWNER_RESPONSE } from '../../__mocks__/mockSolanaRpcResponses';
import type { AccountsService } from '../../accounts/AccountsService';
import type { ConfigProvider } from '../../config';
import type { SolanaConnection } from '../../connection';
import type { TokenPricesService } from '../../token-prices/TokenPrices';
import type { AssetsRepository } from '../AssetsRepository';
import { SnapAssetsAdapter } from './SnapAssetsAdapter';

describe('SnapAssetsAdapter', () => {
  let snapAssetsAdapter: SnapAssetsAdapter;
  let mockConnection: SolanaConnection;
  let mockConfigProvider: ConfigProvider;
  let mockAssetsRepository: AssetsRepository;
  let mockAccountsService: AccountsService;
  let mockTokenApiClient: TokenApiClient;
  let mockTokenPricesService: TokenPricesService;
  let mockNftApiClient: NftApiClient;
  let mockCache: ICache<Serializable>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = createMockConnection();

    mockConfigProvider = {
      getActiveNetworks: jest.fn().mockResolvedValue([]),
    } as unknown as ConfigProvider;

    mockTokenApiClient = {
      getTokensMetadata: jest.fn().mockResolvedValue({}),
    } as unknown as TokenApiClient;

    mockTokenPricesService = {
      getMultipleTokensMarketData: jest.fn().mockResolvedValue({}),
    } as unknown as TokenPricesService;

    mockCache = new InMemoryCache(mockLogger);

    mockNftApiClient = {
      listAddressSolanaNfts: jest
        .fn()
        .mockResolvedValue(MOCK_NFTS_LIST_RESPONSE_MAPPED.items),
    } as unknown as NftApiClient;

    mockAssetsRepository = {
      findByKeyringAccountId: jest.fn(),
      getAll: jest.fn(),
      saveMany: jest.fn(),
    } as unknown as AssetsRepository;

    mockAccountsService = {
      findById: jest.fn(),
    } as unknown as AccountsService;

    snapAssetsAdapter = new SnapAssetsAdapter({
      connection: mockConnection,
      logger: mockLogger,
      configProvider: mockConfigProvider,
      assetsRepository: mockAssetsRepository,
      accountsService: mockAccountsService,
      tokenApiClient: mockTokenApiClient,
      tokenPricesService: mockTokenPricesService,
      cache: mockCache,
      nftApiClient: mockNftApiClient,
    });
  });

  describe('constructor', () => {
    it('creates an adapter instance', () => {
      expect(snapAssetsAdapter).toBeDefined();
    });
  });

  describe('hasChanged', () => {
    it('returns true if the raw amount has changed', () => {
      const asset = cloneDeep(MOCK_ASSET_ENTITY_0);
      asset.rawAmount = '123';
      const assetsLookup = [MOCK_ASSET_ENTITY_0];

      expect(SnapAssetsAdapter.hasChanged(asset, assetsLookup)).toBe(true);
    });

    it('returns true if the ui amount has changed', () => {
      const asset = cloneDeep(MOCK_ASSET_ENTITY_0);
      asset.uiAmount = '123';
      const assetsLookup = [MOCK_ASSET_ENTITY_0];

      expect(SnapAssetsAdapter.hasChanged(asset, assetsLookup)).toBe(true);
    });

    it('returns true if the asset does not exist in the lookup', () => {
      const asset = cloneDeep(MOCK_ASSET_ENTITY_0);
      const assetsLookup = [MOCK_ASSET_ENTITY_1, MOCK_ASSET_ENTITY_2];

      expect(SnapAssetsAdapter.hasChanged(asset, assetsLookup)).toBe(true);
    });

    it('returns false if the asset has not changed', () => {
      const asset = cloneDeep(MOCK_ASSET_ENTITY_0);
      const assetsLookup = [MOCK_ASSET_ENTITY_0];

      expect(SnapAssetsAdapter.hasChanged(asset, assetsLookup)).toBe(false);
    });
  });

  describe('fetch', () => {
    it('aggregates token accounts for the same mint', async () => {
      jest
        .spyOn(mockConfigProvider, 'getActiveNetworks')
        .mockImplementation()
        .mockResolvedValue([Network.Mainnet]);
      jest
        .spyOn(mockTokenApiClient, 'getTokensMetadata')
        .mockImplementation()
        .mockResolvedValue({});

      const [firstTokenAccount] =
        MOCK_SOLANA_RPC_GET_TOKEN_ACCOUNTS_BY_OWNER_RESPONSE.result.value;
      if (!firstTokenAccount) {
        throw new Error('Missing token account fixture');
      }
      const secondTokenAccount = cloneDeep(firstTokenAccount);
      secondTokenAccount.pubkey =
        '7Gg2Y8vCj3v5nQj5xFfC3uT7wJ9sN4mK2pL8rH6dQ1eA';
      secondTokenAccount.account.data.parsed.info.tokenAmount.amount =
        '1000000';
      secondTokenAccount.account.data.parsed.info.tokenAmount.uiAmountString =
        '1';

      jest.spyOn(mockConnection, 'getRpc').mockReturnValue({
        getBalance: jest.fn().mockReturnValue({
          send: jest.fn().mockResolvedValue({ value: 1000000000 }),
        }),
        getTokenAccountsByOwner: jest
          .fn()
          .mockReturnValueOnce({
            send: jest.fn().mockResolvedValue({
              value: [firstTokenAccount, secondTokenAccount],
            }),
          })
          .mockReturnValue({
            send: jest.fn().mockResolvedValue({ value: [] }),
          }),
      } as unknown as ReturnType<SolanaConnection['getRpc']>);

      expect(
        await snapAssetsAdapter.fetch(MOCK_SOLANA_KEYRING_ACCOUNT_0),
      ).toStrictEqual(
        expect.arrayContaining([
          expect.objectContaining({
            mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            rawAmount: '124456789',
            uiAmount: '124.456789',
          }),
        ]),
      );
    });
  });
});
