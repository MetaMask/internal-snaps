import type { Asset, Caip19AssetId } from '@metamask/assets-controller';
import { KeyringEvent } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import type { AssetsProvider } from '@metamask/snap-networks-utils';

import type { AssetEntity, NftAsset } from '../../../../entities';
import { KnownCaip19Id, Network } from '../../../constants/solana';
import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../../test/mocks/solana-keyring-accounts';
import { CoreAssetsAdapter } from './CoreAssetsAdapter';

jest.mock('@metamask/keyring-snap-sdk', () => ({
  emitSnapKeyringEvent: jest.fn(),
}));

(globalThis as { snap?: unknown }).snap = {};

const ACCOUNT_ID = MOCK_SOLANA_KEYRING_ACCOUNT_0.id;
const MAINNET_ASSET_ID = KnownCaip19Id.SolMainnet as Caip19AssetId;
const USDC_ASSET_ID = KnownCaip19Id.UsdcMainnet as Caip19AssetId;
const NFT_ASSET_ID = `${Network.Mainnet}/nft:NftMintAddress`;

/**
 * Builds a controller asset for adapter mapping tests.
 *
 * @param options - Fields to set on the controller asset.
 * @param options.id - CAIP-19 asset ID.
 * @param options.chainId - Chain ID. Defaults to Mainnet.
 * @param options.amount - Raw balance amount.
 * @param options.symbol - Asset symbol.
 * @param options.decimals - Asset decimals.
 * @returns A controller `Asset`.
 */
function createControllerAsset(options: {
  id: Caip19AssetId;
  chainId?: Network;
  amount?: string;
  symbol?: string;
  decimals?: number;
}): Asset {
  const {
    id,
    chainId = Network.Mainnet,
    amount = '1000000000',
    symbol = 'SOL',
    decimals = 9,
  } = options;

  return {
    id,
    chainId,
    balance: { amount },
    metadata: {
      type: 'fungible',
      symbol,
      name: symbol,
      decimals,
    },
    price: {
      assetPriceType: 'fungible',
      price: 0,
      lastUpdated: 0,
      usdPrice: 0,
    },
    fiatValue: 0,
  } as Asset;
}

/**
 * Builds a snap-owned NFT asset entity for `saveMany` tests.
 *
 * @param overrides - Fields to override on the asset entity.
 * @returns An `NftAsset`.
 */
function createNftAsset(overrides: Partial<NftAsset> = {}): NftAsset {
  return {
    assetType: NFT_ASSET_ID as NftAsset['assetType'],
    keyringAccountId: ACCOUNT_ID,
    network: Network.Mainnet,
    mint: 'NftMintAddress',
    pubkey: 'NftTokenAccount',
    symbol: 'NFT',
    rawAmount: '1',
    uiAmount: '1',
    ...overrides,
  };
}

/**
 * Builds a fresh CoreAssetsAdapter and the mocks it is constructed with.
 *
 * @returns The adapter and its mock dependencies.
 */
function createCoreAssetsAdapterContext(): {
  adapter: CoreAssetsAdapter;
  mockAssetsProvider: jest.Mocked<
    Pick<
      AssetsProvider,
      | 'getAccountAssetByID'
      | 'getAccountAssetsByIDs'
      | 'getAccountAssetsByScope'
    >
  >;
  mockFindAccountById: jest.Mock;
  mockGetActiveNetworks: jest.Mock;
} {
  const mockAssetsProvider = {
    getAccountAssetByID: jest.fn().mockResolvedValue(undefined),
    getAccountAssetsByIDs: jest.fn().mockResolvedValue({}),
    getAccountAssetsByScope: jest.fn().mockResolvedValue({}),
  };

  const mockFindAccountById = jest
    .fn()
    .mockResolvedValue(MOCK_SOLANA_KEYRING_ACCOUNT_0);
  const mockGetActiveNetworks = jest.fn().mockResolvedValue([Network.Mainnet]);

  const adapter = new CoreAssetsAdapter({
    getAccountAssetByID: mockAssetsProvider.getAccountAssetByID,
    getAccountAssetsByIDs: mockAssetsProvider.getAccountAssetsByIDs,
    getAccountAssetsByScope: mockAssetsProvider.getAccountAssetsByScope,
    findAccountById: mockFindAccountById,
    getActiveNetworks: mockGetActiveNetworks,
  });

  return {
    adapter,
    mockAssetsProvider,
    mockFindAccountById,
    mockGetActiveNetworks,
  };
}

/**
 * Wraps CoreAssetsAdapter tests with a fresh adapter and mocks.
 *
 * @param testFunction - The test body.
 * @returns The return value of the callback.
 */
async function withCoreAssetsAdapter<ReturnValue>(
  testFunction: (
    payload: ReturnType<typeof createCoreAssetsAdapterContext>,
  ) => Promise<ReturnValue> | ReturnValue,
): Promise<ReturnValue> {
  return await testFunction(createCoreAssetsAdapterContext());
}

describe('CoreAssetsAdapter', () => {
  describe('getAccountAssetByID', () => {
    it('maps a controller asset to an AssetEntity', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        const controllerAsset = createControllerAsset({ id: MAINNET_ASSET_ID });
        mockAssetsProvider.getAccountAssetByID.mockResolvedValue(
          controllerAsset,
        );

        const asset = await adapter.getAccountAssetByID(
          ACCOUNT_ID,
          MAINNET_ASSET_ID,
        );

        expect(mockAssetsProvider.getAccountAssetByID).toHaveBeenCalledWith(
          ACCOUNT_ID,
          MAINNET_ASSET_ID,
        );
        expect(asset).toStrictEqual({
          assetType: MAINNET_ASSET_ID,
          keyringAccountId: ACCOUNT_ID,
          network: Network.Mainnet,
          address: MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
          symbol: 'SOL',
          decimals: 9,
          rawAmount: '1000000000',
          uiAmount: '1',
        });
      });
    });

    it('returns null when the controller has no matching asset', async () => {
      await withCoreAssetsAdapter(async ({ adapter }) => {
        const asset = await adapter.getAccountAssetByID(
          ACCOUNT_ID,
          MAINNET_ASSET_ID,
        );

        expect(asset).toBeNull();
      });
    });

    it('returns null when the account is missing', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockFindAccountById, mockAssetsProvider }) => {
          mockFindAccountById.mockResolvedValue(null);

          const asset = await adapter.getAccountAssetByID(
            ACCOUNT_ID,
            MAINNET_ASSET_ID,
          );

          expect(asset).toBeNull();
          expect(mockAssetsProvider.getAccountAssetByID).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('getAccountAssetsByIDs', () => {
    it('returns mapped assets keyed by ID and null for missing IDs', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        const mainnetAsset = createControllerAsset({ id: MAINNET_ASSET_ID });
        mockAssetsProvider.getAccountAssetsByIDs.mockResolvedValue({
          [MAINNET_ASSET_ID]: mainnetAsset,
        });

        const assets = await adapter.getAccountAssetsByIDs(ACCOUNT_ID, [
          MAINNET_ASSET_ID,
          USDC_ASSET_ID,
        ]);

        expect(mockAssetsProvider.getAccountAssetsByIDs).toHaveBeenCalledWith(
          ACCOUNT_ID,
          [MAINNET_ASSET_ID, USDC_ASSET_ID],
        );
        expect(assets[MAINNET_ASSET_ID]?.assetType).toBe(MAINNET_ASSET_ID);
        expect(assets[USDC_ASSET_ID]).toBeNull();
      });
    });

    it('returns an empty record for an empty ID list', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        const assets = await adapter.getAccountAssetsByIDs(ACCOUNT_ID, []);

        expect(assets).toStrictEqual({});
        expect(
          mockAssetsProvider.getAccountAssetsByIDs,
        ).not.toHaveBeenCalled();
      });
    });
  });

  describe('getAccountAssetsByScope', () => {
    it('maps every controller asset for the requested scope', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        const mainnetAsset = createControllerAsset({ id: MAINNET_ASSET_ID });
        const usdcAsset = createControllerAsset({
          id: USDC_ASSET_ID,
          symbol: 'USDC',
          decimals: 6,
          amount: '1234567',
        });
        mockAssetsProvider.getAccountAssetsByScope.mockResolvedValue({
          [MAINNET_ASSET_ID]: mainnetAsset,
          [USDC_ASSET_ID]: usdcAsset,
        });

        const assets = await adapter.getAccountAssetsByScope(
          Network.Mainnet,
          ACCOUNT_ID,
        );

        expect(mockAssetsProvider.getAccountAssetsByScope).toHaveBeenCalledWith(
          Network.Mainnet,
          ACCOUNT_ID,
        );
        expect(assets.map((asset) => asset.assetType).sort()).toStrictEqual(
          [MAINNET_ASSET_ID, USDC_ASSET_ID].sort(),
        );
        expect(
          assets.every((asset) => asset.keyringAccountId === ACCOUNT_ID),
        ).toBe(true);
      });
    });

    it('returns an empty list when the account is missing', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockFindAccountById, mockAssetsProvider }) => {
          mockFindAccountById.mockResolvedValue(null);

          const assets = await adapter.getAccountAssetsByScope(
            Network.Mainnet,
            ACCOUNT_ID,
          );

          expect(assets).toStrictEqual([]);
          expect(
            mockAssetsProvider.getAccountAssetsByScope,
          ).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('getAccountAssets', () => {
    it('concatenates mapped assets from each active network', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockAssetsProvider, mockGetActiveNetworks }) => {
          mockGetActiveNetworks.mockResolvedValue([
            Network.Mainnet,
            Network.Devnet,
          ]);
          const mainnetAsset = createControllerAsset({ id: MAINNET_ASSET_ID });
          const devnetAsset = createControllerAsset({
            id: KnownCaip19Id.SolDevnet as Caip19AssetId,
            chainId: Network.Devnet,
          });
          mockAssetsProvider.getAccountAssetsByScope.mockImplementation(
            async (scope) => {
              if (scope === Network.Mainnet) {
                return { [MAINNET_ASSET_ID]: mainnetAsset };
              }
              if (scope === Network.Devnet) {
                return {
                  [KnownCaip19Id.SolDevnet as Caip19AssetId]: devnetAsset,
                };
              }
              return {};
            },
          );

          const assets = await adapter.getAccountAssets(ACCOUNT_ID);

          expect(
            mockAssetsProvider.getAccountAssetsByScope,
          ).toHaveBeenCalledTimes(2);
          expect(assets.map((asset) => asset.assetType)).toStrictEqual([
            MAINNET_ASSET_ID,
            KnownCaip19Id.SolDevnet,
          ]);
        },
      );
    });

    it('rejects when any scope request fails', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockAssetsProvider, mockGetActiveNetworks }) => {
          mockGetActiveNetworks.mockResolvedValue([
            Network.Mainnet,
            Network.Devnet,
          ]);
          mockAssetsProvider.getAccountAssetsByScope.mockImplementation(
            async (scope) => {
              if (scope === Network.Devnet) {
                throw new Error('devnet failed');
              }
              return {};
            },
          );

          await expect(adapter.getAccountAssets(ACCOUNT_ID)).rejects.toThrow(
            'devnet failed',
          );
        },
      );
    });
  });

  describe('fetch', () => {
    it('returns no assets because snap-owned NFT fetch is not produced', async () => {
      await withCoreAssetsAdapter(async ({ adapter }) => {
        const assets = await adapter.fetch(MOCK_SOLANA_KEYRING_ACCOUNT_0);

        expect(assets).toStrictEqual([]);
      });
    });
  });

  describe('saveMany', () => {
    it('does nothing when there are no snap-owned assets', async () => {
      await withCoreAssetsAdapter(async ({ adapter }) => {
        await adapter.saveMany([
          {
            assetType: KnownCaip19Id.SolMainnet,
            keyringAccountId: ACCOUNT_ID,
            network: Network.Mainnet,
            address: MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
            symbol: 'SOL',
            decimals: 9,
            rawAmount: '1000000000',
            uiAmount: '1',
          },
        ]);

        expect(emitSnapKeyringEvent).not.toHaveBeenCalled();
      });
    });

    it('publishes only snap-owned assets as added with balance updates', async () => {
      await withCoreAssetsAdapter(async ({ adapter }) => {
        const fungibleAsset: AssetEntity = {
          assetType: KnownCaip19Id.SolMainnet,
          keyringAccountId: ACCOUNT_ID,
          network: Network.Mainnet,
          address: MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
          symbol: 'SOL',
          decimals: 9,
          rawAmount: '1000000000',
          uiAmount: '1',
        };

        await adapter.saveMany([fungibleAsset, createNftAsset()]);

        expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
          expect.anything(),
          KeyringEvent.AccountAssetListUpdated,
          {
            assets: {
              [ACCOUNT_ID]: {
                added: [NFT_ASSET_ID],
                removed: [],
              },
            },
          },
        );
        expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
          expect.anything(),
          KeyringEvent.AccountBalancesUpdated,
          {
            balances: {
              [ACCOUNT_ID]: {
                [NFT_ASSET_ID]: {
                  unit: 'NFT',
                  amount: '1',
                },
              },
            },
          },
        );
      });
    });
  });
});
