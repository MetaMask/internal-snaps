import type { Asset, Caip19AssetId } from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import { KeyringEvent } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import { AssetsProvider } from '@metamask/snap-networks-utils';

import type { AccountResources } from '../../../clients/tron-http';
import {
  TrongridAccountNotFoundError,
  TrongridHttpError,
} from '../../../clients/trongrid/errors';
import { KnownCaip19Id, Network } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';
import { getSnapOwnedAssetIdsForScope } from '../utils/isSnapOwnedAsset';
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

const emptyAccountResources: AccountResources = {
  freeNetUsed: 0,
  freeNetLimit: 0,
  NetLimit: 0,
  TotalNetLimit: 0,
  TotalNetWeight: 0,
  tronPowerUsed: 0,
  tronPowerLimit: 0,
  TotalEnergyLimit: 0,
  TotalEnergyWeight: 0,
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
    >
  >;
  mockGetAddressInfo: jest.Mock;
  mockGetAddressResources: jest.Mock;
  mockGetAddressStakingRewards: jest.Mock;
} {
  const mockAssetsProvider = {
    getAccountAssetByID: jest.fn().mockResolvedValue(undefined),
    getAccountAssetsByIDs: jest.fn().mockResolvedValue({}),
    getAccountAssetsByScope: jest.fn().mockResolvedValue({}),
  };

  const mockGetAddressInfo = jest
    .fn()
    .mockRejectedValue(new TrongridAccountNotFoundError());
  const mockGetAddressResources = jest
    .fn()
    .mockResolvedValue(emptyAccountResources);
  const mockGetAddressStakingRewards = jest.fn().mockResolvedValue(0);

  const adapter = new CoreAssetsAdapter({
    getAccountAssetByID: mockAssetsProvider.getAccountAssetByID,
    getAccountAssetsByIDs: mockAssetsProvider.getAccountAssetsByIDs,
    getAccountAssetsByScope: mockAssetsProvider.getAccountAssetsByScope,
    getAddressInfo: mockGetAddressInfo,
    getAddressResources: mockGetAddressResources,
    getAddressStakingRewards: mockGetAddressStakingRewards,
  });

  return {
    adapter,
    mockAssetsProvider,
    mockGetAddressInfo,
    mockGetAddressResources,
    mockGetAddressStakingRewards,
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

  describe('fetchAssetsAndBalancesForAccount', () => {
    it('returns zero snap-owned assets when the account is inactive', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockGetAddressInfo }) => {
        mockGetAddressInfo.mockRejectedValue(
          new TrongridAccountNotFoundError(),
        );

        const assets = await adapter.fetchAssetsAndBalancesForAccount(
          Network.Mainnet,
          mockAccount,
        );

        const assetTypes = assets.map((asset) => asset.assetType);
        expect(assetTypes).toHaveLength(9);
        expect([...assetTypes].sort()).toStrictEqual(
          [...getSnapOwnedAssetIdsForScope(Network.Mainnet)].sort(),
        );
        expect(assetTypes).not.toContain(KnownCaip19Id.TrxMainnet);
        expect(assets.every((asset) => asset.rawAmount === '0')).toBe(true);
      });
    });

    it('throws when account info fails with an HTTP error', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockGetAddressInfo }) => {
        mockGetAddressInfo.mockRejectedValue(new TrongridHttpError(500));

        await expect(
          adapter.fetchAssetsAndBalancesForAccount(
            Network.Mainnet,
            mockAccount,
          ),
        ).rejects.toThrow(TrongridHttpError);
      });
    });

    it('throws when account resources request rejects', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockGetAddressResources }) => {
          mockGetAddressResources.mockRejectedValue(
            new Error('HTTP error! status: 500'),
          );

          await expect(
            adapter.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
            ),
          ).rejects.toThrow('HTTP error! status: 500');
        },
      );
    });

    it('throws when staking rewards request rejects', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockGetAddressStakingRewards }) => {
          mockGetAddressStakingRewards.mockRejectedValue(
            new Error('HTTP error! status: 503'),
          );

          await expect(
            adapter.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
            ),
          ).rejects.toThrow('HTTP error! status: 503');
        },
      );
    });

    it('maps staking rewards from a successful reward request', async () => {
      await withCoreAssetsAdapter(
        async ({ adapter, mockGetAddressStakingRewards }) => {
          mockGetAddressStakingRewards.mockResolvedValue(1_000_000);

          const assets = await adapter.fetchAssetsAndBalancesForAccount(
            Network.Mainnet,
            mockAccount,
          );
          const stakingRewards = assets.find(
            (asset) =>
              asset.assetType === KnownCaip19Id.TrxStakingRewardsMainnet,
          );

          expect(stakingRewards?.rawAmount).toBe('1000000');
          expect(stakingRewards?.uiAmount).toBe('1');
        },
      );
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
});
