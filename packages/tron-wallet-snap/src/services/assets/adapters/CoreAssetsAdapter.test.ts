import type { Asset, Caip19AssetId } from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import { AssetsProvider } from '@metamask/snap-networks-utils';
import type { Mocked, Mock } from 'vitest';

import { KnownCaip19Id, Network, Networks } from '../../../constants';
import { AssetFetchError } from '../errors';
import { CoreAssetsAdapter } from './CoreAssetsAdapter';

const ACCOUNT_ID = 'test-account-id';
const MAINNET_ASSET_ID = KnownCaip19Id.TrxMainnet as Caip19AssetId;
const NILE_ASSET_ID = KnownCaip19Id.TrxNile as Caip19AssetId;
const USDT_ASSET_ID = KnownCaip19Id.UsdtMainnet as Caip19AssetId;
const STAKED_ENERGY_ASSET_ID =
  KnownCaip19Id.TrxStakedForEnergyMainnet as Caip19AssetId;
const ENERGY_ASSET_ID = KnownCaip19Id.EnergyMainnet as Caip19AssetId;
const BANDWIDTH_ASSET_ID = KnownCaip19Id.BandwidthMainnet as Caip19AssetId;

const TRON_BALANCE_METADATA = {
  staking: {
    energy: '7000000',
    bandwidth: '3000000',
    rewards: '1000000',
    inLockPeriod: '2000000',
    readyForWithdrawal: '4000000',
  },
  energy: { available: '600', limit: '1000' },
  bandwidth: { available: '500', limit: '2000' },
};

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
 * @param options.balanceMetadata - Metadata attached to the balance (e.g. Tron resources/staking).
 * @returns A controller `Asset`.
 */
function createControllerAsset(options: {
  id: Caip19AssetId;
  chainId?: Network;
  amount?: string;
  symbol?: string;
  decimals?: number;
  image?: string;
  balanceMetadata?: Record<string, unknown>;
}): Asset {
  const {
    id,
    chainId = Network.Mainnet,
    amount = '1',
    symbol = 'TRX',
    decimals = 6,
    image = 'https://example.com/trx.png',
    balanceMetadata,
  } = options;

  return {
    id,
    chainId,
    balance: { amount, ...(balanceMetadata && { metadata: balanceMetadata }) },
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
  };
}

/**
 * Builds a fresh CoreAssetsAdapter and the mocks it is constructed with.
 *
 * @returns The adapter and its mock dependencies.
 */
function createCoreAssetsAdapterContext(): {
  adapter: CoreAssetsAdapter;
  mockAssetsProvider: Mocked<
    Pick<
      AssetsProvider,
      | 'getAccountAssetByID'
      | 'getAccountAssetsByIDs'
      | 'getAccountAssetsByScope'
      | 'getAssets'
    >
  >;
} {
  const mockAssetsProvider = {
    getAccountAssetByID: vi.fn().mockResolvedValue(undefined),
    getAccountAssetsByIDs: vi.fn().mockResolvedValue({}),
    getAccountAssetsByScope: vi.fn().mockResolvedValue({}),
    getAssets: vi.fn().mockResolvedValue({}),
  };

  const adapter = new CoreAssetsAdapter({
    getAccountAssetByID: mockAssetsProvider.getAccountAssetByID,
    getAccountAssetsByIDs: mockAssetsProvider.getAccountAssetsByIDs,
    getAccountAssetsByScope: mockAssetsProvider.getAccountAssetsByScope,
    getAssets: mockAssetsProvider.getAssets,
  });

  return {
    adapter,
    mockAssetsProvider,
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

    it('returns null when a snap owned asset cannot be resolved', async () => {
      await withCoreAssetsAdapter(async ({ adapter }) => {
        const asset = await adapter.getAccountAssetByID(
          ACCOUNT_ID,
          ENERGY_ASSET_ID,
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

  describe('special assets from the TRX balance metadata', () => {
    it('derives a requested staked asset from the TRX balance metadata', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        const trxAsset = createControllerAsset({
          id: MAINNET_ASSET_ID,
          amount: '0',
          balanceMetadata: TRON_BALANCE_METADATA,
        });
        mockAssetsProvider.getAccountAssetsByIDs.mockResolvedValue({
          [MAINNET_ASSET_ID]: trxAsset,
        });

        const asset = await adapter.getAccountAssetByID(
          ACCOUNT_ID,
          STAKED_ENERGY_ASSET_ID,
        );

        expect(mockAssetsProvider.getAccountAssetsByIDs).toHaveBeenCalledWith(
          ACCOUNT_ID,
          [STAKED_ENERGY_ASSET_ID, MAINNET_ASSET_ID],
        );
        expect(asset).toStrictEqual({
          assetType: STAKED_ENERGY_ASSET_ID,
          keyringAccountId: ACCOUNT_ID,
          network: Network.Mainnet,
          symbol: Networks[Network.Mainnet].stakedForEnergy.symbol,
          decimals: Networks[Network.Mainnet].stakedForEnergy.decimals,
          rawAmount: '7000000',
          uiAmount: '7',
          iconUrl: Networks[Network.Mainnet].stakedForEnergy.iconUrl,
        });
      });
    });

    it('derives resource assets and keeps the requested order', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        mockAssetsProvider.getAccountAssetsByIDs.mockResolvedValue({
          [MAINNET_ASSET_ID]: createControllerAsset({
            id: MAINNET_ASSET_ID,
            amount: '0',
            balanceMetadata: TRON_BALANCE_METADATA,
          }),
        });

        const assets = await adapter.getAccountAssetsByIDs(ACCOUNT_ID, [
          ENERGY_ASSET_ID,
          USDT_ASSET_ID,
          BANDWIDTH_ASSET_ID,
        ]);

        expect(mockAssetsProvider.getAccountAssetsByIDs).toHaveBeenCalledWith(
          ACCOUNT_ID,
          [
            ENERGY_ASSET_ID,
            USDT_ASSET_ID,
            BANDWIDTH_ASSET_ID,
            MAINNET_ASSET_ID,
          ],
        );
        expect(assets[0]).toMatchObject({
          assetType: ENERGY_ASSET_ID,
          rawAmount: '600',
          uiAmount: '600',
        });
        expect(assets[1]).toBeNull();
        expect(assets[2]).toMatchObject({
          assetType: BANDWIDTH_ASSET_ID,
          rawAmount: '500',
          uiAmount: '500',
        });
      });
    });

    it('prefers the metadata value over a legacy special asset entry', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        mockAssetsProvider.getAccountAssetsByIDs.mockResolvedValue({
          [MAINNET_ASSET_ID]: createControllerAsset({
            id: MAINNET_ASSET_ID,
            amount: '0',
            balanceMetadata: TRON_BALANCE_METADATA,
          }),
          [ENERGY_ASSET_ID]: createControllerAsset({
            id: ENERGY_ASSET_ID,
            amount: '1',
            symbol: 'ENERGY',
            decimals: 0,
          }),
        });

        const [asset] = await adapter.getAccountAssetsByIDs(ACCOUNT_ID, [
          ENERGY_ASSET_ID,
        ]);

        expect(asset).toMatchObject({ rawAmount: '600', uiAmount: '600' });
      });
    });

    it('falls back to the legacy special asset when metadata is absent', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        mockAssetsProvider.getAccountAssetsByIDs.mockResolvedValue({
          [ENERGY_ASSET_ID]: createControllerAsset({
            id: ENERGY_ASSET_ID,
            amount: '42',
            symbol: 'ENERGY',
            decimals: 0,
          }),
        });

        const [asset] = await adapter.getAccountAssetsByIDs(ACCOUNT_ID, [
          ENERGY_ASSET_ID,
        ]);

        expect(asset).toMatchObject({ rawAmount: '42', uiAmount: '42' });
      });
    });

    it('falls back to the legacy special asset when metadata is invalid', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        mockAssetsProvider.getAccountAssetsByIDs.mockResolvedValue({
          [MAINNET_ASSET_ID]: createControllerAsset({
            id: MAINNET_ASSET_ID,
            amount: '0',
            balanceMetadata: { energy: { available: 'NaN' } },
          }),
          [ENERGY_ASSET_ID]: createControllerAsset({
            id: ENERGY_ASSET_ID,
            amount: '42',
            symbol: 'ENERGY',
            decimals: 0,
          }),
        });

        const [asset] = await adapter.getAccountAssetsByIDs(ACCOUNT_ID, [
          ENERGY_ASSET_ID,
        ]);

        expect(asset).toMatchObject({ rawAmount: '42', uiAmount: '42' });
      });
    });

    it('derives special assets from a fresh controller fetch', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        (mockAssetsProvider.getAssets as Mock).mockResolvedValue({
          [ACCOUNT_ID]: {
            [MAINNET_ASSET_ID]: createControllerAsset({
              id: MAINNET_ASSET_ID,
              amount: '0',
              balanceMetadata: TRON_BALANCE_METADATA,
            }),
          },
        });

        const [asset] = await adapter.fetchAccountAssetsByIDs(mockAccount, [
          STAKED_ENERGY_ASSET_ID,
        ]);

        expect(asset).toMatchObject({
          assetType: STAKED_ENERGY_ASSET_ID,
          rawAmount: '7000000',
          uiAmount: '7',
        });
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
        mockAssetsProvider.getAccountAssetsByScope
          .mockResolvedValueOnce({ [MAINNET_ASSET_ID]: mainnetAsset })
          .mockResolvedValueOnce({ [NILE_ASSET_ID]: nileAsset })
          .mockResolvedValueOnce({});

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
        mockAssetsProvider.getAccountAssetsByScope
          .mockResolvedValueOnce({})
          .mockRejectedValueOnce(new Error('nile failed'));

        await expect(adapter.getAccountAssets(ACCOUNT_ID)).rejects.toThrow(
          'nile failed',
        );
      });
    });
  });

  describe('fetchAccountAssetsByIDs', () => {
    it('fetches all assets, including special assets, from a forced, cache-bypassing one-time fetch', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        (mockAssetsProvider.getAssets as Mock).mockResolvedValue({
          [ACCOUNT_ID]: {
            [MAINNET_ASSET_ID]: createControllerAsset({
              id: MAINNET_ASSET_ID,
              amount: '1',
            }),
          },
        });

        const [asset] = await adapter.fetchAccountAssetsByIDs(mockAccount, [
          MAINNET_ASSET_ID,
        ]);

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
      });
    });

    it('returns null for requested asset IDs that could not be resolved', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        (mockAssetsProvider.getAssets as Mock).mockResolvedValue({
          [ACCOUNT_ID]: {},
        });

        const assets = await adapter.fetchAccountAssetsByIDs(mockAccount, [
          MAINNET_ASSET_ID,
          USDT_ASSET_ID,
        ]);

        expect(assets).toStrictEqual([null, null]);
      });
    });

    it('deduplicates scopes across the requested asset IDs', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        (mockAssetsProvider.getAssets as Mock).mockResolvedValue({});

        await adapter.fetchAccountAssetsByIDs(mockAccount, [
          MAINNET_ASSET_ID,
          USDT_ASSET_ID,
        ]);

        expect(mockAssetsProvider.getAssets).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ chainIds: [Network.Mainnet] }),
        );
      });
    });

    it('rejects with AssetFetchError when the controller fetch fails', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        (mockAssetsProvider.getAssets as Mock).mockRejectedValue(
          new Error('fetch failed'),
        );

        await expect(
          adapter.fetchAccountAssetsByIDs(mockAccount, [MAINNET_ASSET_ID]),
        ).rejects.toThrow(AssetFetchError);
      });
    });

    it('rethrows AssetFetchError as-is when the controller fetch fails', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        const fetchError = new AssetFetchError('fetch failed');
        (mockAssetsProvider.getAssets as Mock).mockRejectedValue(fetchError);

        await expect(
          adapter.fetchAccountAssetsByIDs(mockAccount, [MAINNET_ASSET_ID]),
        ).rejects.toBe(fetchError);
      });
    });
  });

  describe('fetchAccountAssetByID', () => {
    it('returns the single fresh asset', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        (mockAssetsProvider.getAssets as Mock).mockResolvedValue({
          [ACCOUNT_ID]: {
            [MAINNET_ASSET_ID]: createControllerAsset({
              id: MAINNET_ASSET_ID,
              amount: '2',
            }),
          },
        });

        const asset = await adapter.fetchAccountAssetByID(
          mockAccount,
          MAINNET_ASSET_ID,
        );

        expect(asset?.assetType).toBe(MAINNET_ASSET_ID);
        expect(asset?.uiAmount).toBe('2');
      });
    });
  });
});
