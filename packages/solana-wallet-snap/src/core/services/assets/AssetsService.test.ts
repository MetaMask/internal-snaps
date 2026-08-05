import type { NftApiClient } from '../../clients/nft-api/NftApiClient';
import type { TokenApiClient } from '../../clients/token-api-client/TokenApiClient';
import { Network } from '../../constants/solana';
import {
  MOCK_ASSET_ENTITY_0,
  MOCK_ASSET_ENTITY_1,
  SOLANA_MOCK_TOKEN_METADATA,
} from '../../test/mocks/asset-entities';
import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../test/mocks/solana-keyring-accounts';
import type { AccountsService } from '../accounts/AccountsService';
import type { ConfigProvider } from '../config';
import { mockLogger } from '../mocks/logger';
import type { TokenPricesService } from '../token-prices/TokenPrices';
import { AssetsService } from './AssetsService';

describe('AssetsService', () => {
  let assetsService: AssetsService;
  let mockConfigProvider: ConfigProvider;
  let mockAccountsService: AccountsService;
  let mockTokenApiClient: TokenApiClient;
  let mockTokenPricesService: TokenPricesService;
  let mockNftApiClient: NftApiClient;
  let mockAssetsProvider: import('@metamask/snap-networks-utils').AssetsProvider;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigProvider = {
      getActiveNetworks: jest.fn().mockResolvedValue([Network.Mainnet]),
    } as unknown as ConfigProvider;

    mockTokenApiClient = {
      getTokensMetadata: jest
        .fn()
        .mockResolvedValue(SOLANA_MOCK_TOKEN_METADATA),
    } as unknown as TokenApiClient;

    mockTokenPricesService = {
      getMultipleTokensMarketData: jest.fn().mockResolvedValue({}),
    } as unknown as TokenPricesService;

    mockNftApiClient = {} as unknown as NftApiClient;

    mockAccountsService = {
      findById: jest.fn().mockResolvedValue(MOCK_SOLANA_KEYRING_ACCOUNT_0),
    } as unknown as AccountsService;

    mockAssetsProvider = {
      getAccountAssetByID: jest.fn(),
      getAccountAssetsByIDs: jest.fn(),
      getAccountAssetsByScope: jest.fn(),
    } as unknown as import('@metamask/snap-networks-utils').AssetsProvider;

    assetsService = new AssetsService({
      logger: mockLogger,
      configProvider: mockConfigProvider,
      accountsService: mockAccountsService,
      tokenApiClient: mockTokenApiClient,
      tokenPricesService: mockTokenPricesService,
      nftApiClient: mockNftApiClient,
      assetsProvider: mockAssetsProvider,
    });
  });

  describe('getAccountAssetByID', () => {
    it('routes reads through AssetsProvider', async () => {
      jest.spyOn(mockAssetsProvider, 'getAccountAssetByID').mockResolvedValue({
        id: MOCK_ASSET_ENTITY_1.assetType,
        chainId: Network.Mainnet,
        balance: { amount: MOCK_ASSET_ENTITY_1.rawAmount },
        metadata: {
          type: 'fungible',
          symbol: MOCK_ASSET_ENTITY_1.symbol,
          name: MOCK_ASSET_ENTITY_1.symbol,
          decimals: MOCK_ASSET_ENTITY_1.decimals,
        },
        price: { price: 0, lastUpdated: 0 },
        fiatValue: 0,
      } as never);

      const asset = await assetsService.getAccountAssetByID(
        MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
        MOCK_ASSET_ENTITY_1.assetType,
      );

      expect(mockAssetsProvider.getAccountAssetByID).toHaveBeenCalledWith(
        MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
        MOCK_ASSET_ENTITY_1.assetType,
      );
      expect(asset).toMatchObject({
        assetType: MOCK_ASSET_ENTITY_1.assetType,
        keyringAccountId: MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
        rawAmount: MOCK_ASSET_ENTITY_1.rawAmount,
      });
    });
  });

  describe('getAccountAssetsByIDs', () => {
    it('returns keyed results from AssetsProvider', async () => {
      jest.spyOn(mockAssetsProvider, 'getAccountAssetsByIDs').mockResolvedValue({
        [MOCK_ASSET_ENTITY_0.assetType]: {
          id: MOCK_ASSET_ENTITY_0.assetType,
          chainId: Network.Mainnet,
          balance: { amount: MOCK_ASSET_ENTITY_0.rawAmount },
          metadata: {
            type: 'native',
            symbol: 'SOL',
            name: 'Solana',
            decimals: 9,
          },
          price: { price: 0, lastUpdated: 0 },
          fiatValue: 0,
        },
      } as never);

      const assets = await assetsService.getAccountAssetsByIDs(
        MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
        [MOCK_ASSET_ENTITY_0.assetType],
      );

      expect(mockAssetsProvider.getAccountAssetsByIDs).toHaveBeenCalledWith(
        MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
        [MOCK_ASSET_ENTITY_0.assetType],
      );
      expect(assets).toStrictEqual({
        [MOCK_ASSET_ENTITY_0.assetType]: expect.objectContaining({
          assetType: MOCK_ASSET_ENTITY_0.assetType,
        }),
      });
    });
  });

  describe('getAccountAssetsByScope', () => {
    it('routes scope reads through AssetsProvider', async () => {
      jest.spyOn(mockAssetsProvider, 'getAccountAssetsByScope').mockResolvedValue({
        [MOCK_ASSET_ENTITY_0.assetType]: {
          id: MOCK_ASSET_ENTITY_0.assetType,
          chainId: Network.Mainnet,
          balance: { amount: MOCK_ASSET_ENTITY_0.rawAmount },
          metadata: {
            type: 'native',
            symbol: 'SOL',
            name: 'Solana',
            decimals: 9,
          },
          price: { price: 0, lastUpdated: 0 },
          fiatValue: 0,
        },
        [MOCK_ASSET_ENTITY_1.assetType]: {
          id: MOCK_ASSET_ENTITY_1.assetType,
          chainId: Network.Mainnet,
          balance: { amount: MOCK_ASSET_ENTITY_1.rawAmount },
          metadata: {
            type: 'fungible',
            symbol: MOCK_ASSET_ENTITY_1.symbol,
            name: MOCK_ASSET_ENTITY_1.symbol,
            decimals: MOCK_ASSET_ENTITY_1.decimals,
          },
          price: { price: 0, lastUpdated: 0 },
          fiatValue: 0,
        },
      } as never);

      const assets = await assetsService.getAccountAssetsByScope(
        Network.Mainnet,
        MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
      );

      expect(mockAssetsProvider.getAccountAssetsByScope).toHaveBeenCalledWith(
        Network.Mainnet,
        MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
      );
      expect(assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assetType: MOCK_ASSET_ENTITY_0.assetType,
          }),
          expect.objectContaining({
            assetType: MOCK_ASSET_ENTITY_1.assetType,
          }),
        ]),
      );
    });
  });

  describe('getAccountAssetsForAllActiveScopes', () => {
    it('aggregates scope reads across active networks', async () => {
      jest.spyOn(mockAssetsProvider, 'getAccountAssetsByScope').mockResolvedValue({
        [MOCK_ASSET_ENTITY_0.assetType]: {
          id: MOCK_ASSET_ENTITY_0.assetType,
          chainId: Network.Mainnet,
          balance: { amount: MOCK_ASSET_ENTITY_0.rawAmount },
          metadata: {
            type: 'native',
            symbol: 'SOL',
            name: 'Solana',
            decimals: 9,
          },
          price: { price: 0, lastUpdated: 0 },
          fiatValue: 0,
        },
      } as never);

      const assets = await assetsService.getAccountAssetsForAllActiveScopes(
        MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
      );

      expect(mockAssetsProvider.getAccountAssetsByScope).toHaveBeenCalledWith(
        Network.Mainnet,
        MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
      );
      expect(assets).toEqual([
        expect.objectContaining({
          assetType: MOCK_ASSET_ENTITY_0.assetType,
        }),
      ]);
    });
  });
});
