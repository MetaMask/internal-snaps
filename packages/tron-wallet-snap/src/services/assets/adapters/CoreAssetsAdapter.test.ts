import type { Asset, Caip19AssetId } from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import { KeyringEvent } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import { AssetsProvider } from '@metamask/snap-networks-utils';

import { KnownCaip19Id, Network } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';
import { CoreAssetsAdapter } from './CoreAssetsAdapter';

jest.mock('@metamask/keyring-snap-sdk', () => ({
  emitSnapKeyringEvent: jest.fn(),
}));

(globalThis as { snap?: unknown }).snap = {};

const ACCOUNT_ID = 'test-account-id';
const MAINNET_ASSET_ID = KnownCaip19Id.TrxMainnet as Caip19AssetId;
const NILE_ASSET_ID = KnownCaip19Id.TrxNile as Caip19AssetId;
const USDT_ASSET_ID = KnownCaip19Id.UsdtMainnet as Caip19AssetId;

const mockAccount: KeyringAccount = {
  id: ACCOUNT_ID,
  address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
  type: 'eip155:eoa',
  options: {},
  methods: [],
  scopes: [Network.Mainnet],
};

/**
 * Builds a controller asset for adapter mapping tests.
 *
 * @param options - Fields to set on the controller asset.
 * @param options.id - CAIP-19 asset ID.
 * @param options.chainId - Chain ID. Defaults to Mainnet.
 * @param options.amount - UI balance amount (with decimals applied).
 * @param options.symbol - Asset symbol.
 * @param options.decimals - Asset decimals.
 * @param options.image - Asset icon URL.
 * @returns A controller `Asset`.
 */
function createControllerAsset(options: {
  id: Caip19AssetId;
  chainId?: Network;
  amount?: string;
  symbol?: string;
  decimals?: number;
  image?: string;
}): Asset {
  const {
    id,
    chainId = Network.Mainnet,
    amount = '1',
    symbol = 'TRX',
    decimals = 6,
    image = 'https://example.com/trx.png',
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
      image,
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
 * Builds a snap-owned asset entity for `saveMany` tests.
 *
 * @param overrides - Fields to override on the asset entity.
 * @returns An `AssetEntity`.
 */
function createAssetEntity(
  overrides: Partial<AssetEntity> & Pick<AssetEntity, 'assetType'>,
): AssetEntity {
  return {
    keyringAccountId: ACCOUNT_ID,
    network: Network.Mainnet,
    symbol: 'ENERGY',
    decimals: 0,
    rawAmount: '100',
    uiAmount: '100',
    iconUrl: '',
    ...overrides,
  } as AssetEntity;
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
      | 'getAssets'
    >
  >;
  mockFetchSnapOwnedAssets: jest.Mock;
} {
  const mockAssetsProvider = {
    getAccountAssetByID: jest.fn().mockResolvedValue(undefined),
    getAccountAssetsByIDs: jest.fn().mockResolvedValue({}),
    getAccountAssetsByScope: jest.fn().mockResolvedValue({}),
    getAssets: jest.fn().mockResolvedValue({}),
  };

  const mockFetchSnapOwnedAssets = jest.fn().mockResolvedValue([]);

  const adapter = new CoreAssetsAdapter({
    getAccountAssetByID: mockAssetsProvider.getAccountAssetByID,
    getAccountAssetsByIDs: mockAssetsProvider.getAccountAssetsByIDs,
    getAccountAssetsByScope: mockAssetsProvider.getAccountAssetsByScope,
    getAssets: mockAssetsProvider.getAssets,
    fetchSnapOwnedAssets: mockFetchSnapOwnedAssets,
  });

  return {
    adapter,
    mockAssetsProvider,
    mockFetchSnapOwnedAssets,
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
          symbol: 'TRX',
          decimals: 6,
          rawAmount: '1000000',
          uiAmount: '1',
          iconUrl: 'https://example.com/trx.png',
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
  });

  describe('getAccountAssetsByIDs', () => {
    it('returns mapped assets in request order and null for missing IDs', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        const mainnetAsset = createControllerAsset({ id: MAINNET_ASSET_ID });
        mockAssetsProvider.getAccountAssetsByIDs.mockResolvedValue({
          [MAINNET_ASSET_ID]: mainnetAsset,
        });

        const assets = await adapter.getAccountAssetsByIDs(ACCOUNT_ID, [
          MAINNET_ASSET_ID,
          USDT_ASSET_ID,
        ]);

        expect(mockAssetsProvider.getAccountAssetsByIDs).toHaveBeenCalledWith(
          ACCOUNT_ID,
          [MAINNET_ASSET_ID, USDT_ASSET_ID],
        );
        expect(assets).toHaveLength(2);
        expect(assets[0]?.assetType).toBe(MAINNET_ASSET_ID);
        expect(assets[1]).toBeNull();
      });
    });
  });

  describe('getAccountAssetsByScope', () => {
    it('maps every controller asset for the requested scope', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        const mainnetAsset = createControllerAsset({ id: MAINNET_ASSET_ID });
        const usdtAsset = createControllerAsset({
          id: USDT_ASSET_ID,
          symbol: 'USDT',
        });
        mockAssetsProvider.getAccountAssetsByScope.mockResolvedValue({
          [MAINNET_ASSET_ID]: mainnetAsset,
          [USDT_ASSET_ID]: usdtAsset,
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
          [MAINNET_ASSET_ID, USDT_ASSET_ID].sort(),
        );
        expect(
          assets.every((asset) => asset.keyringAccountId === ACCOUNT_ID),
        ).toBe(true);
      });
    });
  });

  describe('getAccountAssets', () => {
    it('concatenates mapped assets from Mainnet, Nile, and Shasta', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        const mainnetAsset = createControllerAsset({ id: MAINNET_ASSET_ID });
        const nileAsset = createControllerAsset({
          id: NILE_ASSET_ID,
          chainId: Network.Nile,
        });
        mockAssetsProvider.getAccountAssetsByScope.mockImplementation(
          async (scope: `${string}:${string}`) => {
            if (scope === Network.Mainnet) {
              return { [MAINNET_ASSET_ID]: mainnetAsset };
            }
            if (scope === Network.Nile) {
              return { [NILE_ASSET_ID]: nileAsset };
            }
            return {};
          },
        );

        const assets = await adapter.getAccountAssets(ACCOUNT_ID);

        expect(
          mockAssetsProvider.getAccountAssetsByScope,
        ).toHaveBeenCalledTimes(3);
        expect(mockAssetsProvider.getAccountAssetsByScope).toHaveBeenCalledWith(
          Network.Mainnet,
          ACCOUNT_ID,
        );
        expect(mockAssetsProvider.getAccountAssetsByScope).toHaveBeenCalledWith(
          Network.Nile,
          ACCOUNT_ID,
        );
        expect(mockAssetsProvider.getAccountAssetsByScope).toHaveBeenCalledWith(
          Network.Shasta,
          ACCOUNT_ID,
        );
        expect(assets.map((asset) => asset.assetType)).toStrictEqual([
          MAINNET_ASSET_ID,
          NILE_ASSET_ID,
        ]);
      });
    });

    it('rejects when any scope request fails', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        mockAssetsProvider.getAccountAssetsByScope.mockImplementation(
          async (scope: `${string}:${string}`) => {
            if (scope === Network.Nile) {
              throw new Error('nile failed');
            }
            return {};
          },
        );

        await expect(adapter.getAccountAssets(ACCOUNT_ID)).rejects.toThrow(
          'nile failed',
        );
      });
    });
  });

  describe('fetchAccountAssets', () => {
    it('fetches through the controller with forced update and no server cache', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        await adapter.fetchAccountAssets(mockAccount);

        expect(mockAssetsProvider.getAssets).toHaveBeenCalledWith(
          [expect.objectContaining({ id: ACCOUNT_ID })],
          {
            chainIds: [Network.Mainnet],
            forceUpdate: true,
            bypassServerCache: true,
          },
        );
      });
    });

    it('maps the fetched controller assets for the account', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        const mainnetAsset = createControllerAsset({ id: MAINNET_ASSET_ID });
        const usdtAsset = createControllerAsset({
          id: USDT_ASSET_ID,
          symbol: 'USDT',
        });
        mockAssetsProvider.getAssets.mockResolvedValue({
          [ACCOUNT_ID]: {
            [MAINNET_ASSET_ID]: mainnetAsset,
            [USDT_ASSET_ID]: usdtAsset,
          },
        } as never);

        const assets = await adapter.fetchAccountAssets(mockAccount);

        expect(assets.map((asset) => asset.assetType).sort()).toStrictEqual(
          [MAINNET_ASSET_ID, USDT_ASSET_ID].sort(),
        );
        expect(
          assets.every((asset) => asset.keyringAccountId === ACCOUNT_ID),
        ).toBe(true);
      });
    });

    it('returns an empty list when the controller returns nothing for the account', async () => {
      await withCoreAssetsAdapter(async ({ adapter }) => {
        const assets = await adapter.fetchAccountAssets(mockAccount);

        expect(assets).toStrictEqual([]);
      });
    });

    it('rejects when the controller fetch fails', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        mockAssetsProvider.getAssets.mockRejectedValue(
          new Error('fetch failed'),
        );

        await expect(adapter.fetchAccountAssets(mockAccount)).rejects.toThrow(
          'fetch failed',
        );
      });
    });
  });

  describe('saveMany', () => {
    it('does nothing when there are no snap-owned assets', async () => {
      await withCoreAssetsAdapter(async ({ adapter }) => {
        await adapter.saveMany([
          createAssetEntity({
            assetType: KnownCaip19Id.TrxMainnet,
            symbol: 'TRX',
            decimals: 6,
            rawAmount: '1000000',
            uiAmount: '1',
          }),
        ]);

        expect(emitSnapKeyringEvent).not.toHaveBeenCalled();
      });
    });

    it('publishes only snap-owned assets as added with balance updates', async () => {
      await withCoreAssetsAdapter(async ({ adapter }) => {
        await adapter.saveMany([
          createAssetEntity({
            assetType: KnownCaip19Id.TrxMainnet,
            symbol: 'TRX',
            decimals: 6,
            rawAmount: '1000000',
            uiAmount: '1',
          }),
          createAssetEntity({
            assetType: KnownCaip19Id.EnergyMainnet,
            symbol: 'ENERGY',
            rawAmount: '100',
            uiAmount: '100',
          }),
        ]);

        expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
          expect.anything(),
          KeyringEvent.AccountAssetListUpdated,
          {
            assets: {
              [ACCOUNT_ID]: {
                added: [KnownCaip19Id.EnergyMainnet],
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
                [KnownCaip19Id.EnergyMainnet]: {
                  unit: 'ENERGY',
                  amount: '100',
                },
              },
            },
          },
        );
      });
    });
  });

  describe('getFreshAccountAssetsByIDs', () => {
    it('fetches controller-tracked assets from a forced, cache-bypassing one-time fetch', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockAssetsProvider, mockFetchSnapOwnedAssets }) => {
          mockFetchSnapOwnedAssets.mockResolvedValue([]);
          (mockAssetsProvider.getAssets as jest.Mock).mockResolvedValue({
            [ACCOUNT_ID]: {
              [MAINNET_ASSET_ID]: createControllerAsset({
                id: MAINNET_ASSET_ID,
                amount: '1',
              }),
            },
          });

          const [asset] = await adapter.getFreshAccountAssetsByIDs(
            mockAccount,
            [MAINNET_ASSET_ID],
          );

          expect(mockAssetsProvider.getAssets).toHaveBeenCalledWith(
            [expect.objectContaining({ id: ACCOUNT_ID })],
            {
              chainIds: [Network.Mainnet],
              forceUpdate: true,
              bypassServerCache: true,
            },
          );
          expect(asset?.assetType).toBe(MAINNET_ASSET_ID);
          expect(asset?.uiAmount).toBe('1');
        },
      );
    });

    it('resolves snap-owned assets from the direct RPC fetch', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockFetchSnapOwnedAssets, mockAssetsProvider }) => {
          const energy = createAssetEntity({
            assetType: KnownCaip19Id.EnergyMainnet,
            rawAmount: '200',
            uiAmount: '200',
          });
          const bandwidth = createAssetEntity({
            assetType: KnownCaip19Id.BandwidthMainnet,
            rawAmount: '4000',
            uiAmount: '4000',
          });
          mockFetchSnapOwnedAssets.mockResolvedValue([energy, bandwidth]);
          (mockAssetsProvider.getAssets as jest.Mock).mockResolvedValue({});

          const [energyAsset, bandwidthAsset] = await adapter
            .getFreshAccountAssetsByIDs(mockAccount, [
              KnownCaip19Id.EnergyMainnet,
              KnownCaip19Id.BandwidthMainnet,
            ])
            .then((assets) => assets);

          expect(energyAsset?.rawAmount).toBe('200');
          expect(bandwidthAsset?.rawAmount).toBe('4000');
        },
      );
    });

    it('returns null for requested asset IDs that could not be resolved', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockFetchSnapOwnedAssets, mockAssetsProvider }) => {
          mockFetchSnapOwnedAssets.mockResolvedValue([]);
          (mockAssetsProvider.getAssets as jest.Mock).mockResolvedValue({
            [ACCOUNT_ID]: {},
          });

          const assets = await adapter.getFreshAccountAssetsByIDs(mockAccount, [
            MAINNET_ASSET_ID,
            USDT_ASSET_ID,
          ]);

          expect(assets).toStrictEqual([null, null]);
        },
      );
    });

    it('deduplicates scopes across the requested asset IDs', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockAssetsProvider, mockFetchSnapOwnedAssets }) => {
          mockFetchSnapOwnedAssets.mockResolvedValue([]);
          (mockAssetsProvider.getAssets as jest.Mock).mockResolvedValue({});

          await adapter.getFreshAccountAssetsByIDs(mockAccount, [
            MAINNET_ASSET_ID,
            USDT_ASSET_ID,
          ]);

          expect(mockAssetsProvider.getAssets).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ chainIds: [Network.Mainnet] }),
          );
        },
      );
    });
  });

  describe('getFreshAccountAssetByID', () => {
    it('returns the single fresh asset', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockAssetsProvider, mockFetchSnapOwnedAssets }) => {
          mockFetchSnapOwnedAssets.mockResolvedValue([]);
          (mockAssetsProvider.getAssets as jest.Mock).mockResolvedValue({
            [ACCOUNT_ID]: {
              [MAINNET_ASSET_ID]: createControllerAsset({
                id: MAINNET_ASSET_ID,
                amount: '2',
              }),
            },
          });

          const asset = await adapter.getFreshAccountAssetByID(
            mockAccount,
            MAINNET_ASSET_ID,
          );

          expect(asset?.assetType).toBe(MAINNET_ASSET_ID);
          expect(asset?.uiAmount).toBe('2');
        },
      );
    });
  });
});
