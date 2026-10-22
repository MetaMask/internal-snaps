import type { Asset, Caip19AssetId } from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import { AssetsProvider } from '@metamask/snap-networks-utils';

import { KnownCaip19Id, Network } from '../../../constants';
import { AssetFetchError } from '../errors';
import { CoreAssetsAdapter } from './CoreAssetsAdapter';

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
} {
  const mockAssetsProvider = {
    getAccountAssetByID: jest.fn().mockResolvedValue(undefined),
    getAccountAssetsByIDs: jest.fn().mockResolvedValue({}),
    getAccountAssetsByScope: jest.fn().mockResolvedValue({}),
    getAssets: jest.fn().mockResolvedValue({}),
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

  describe('fetchAccountAssetsByIDs', () => {
    it('fetches all assets, including special assets, from a forced, cache-bypassing one-time fetch', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        (mockAssetsProvider.getAssets as jest.Mock).mockResolvedValue({
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
        (mockAssetsProvider.getAssets as jest.Mock).mockResolvedValue({
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
        (mockAssetsProvider.getAssets as jest.Mock).mockResolvedValue({});

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
        (mockAssetsProvider.getAssets as jest.Mock).mockRejectedValue(
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
        (mockAssetsProvider.getAssets as jest.Mock).mockRejectedValue(
          fetchError,
        );

        await expect(
          adapter.fetchAccountAssetsByIDs(mockAccount, [MAINNET_ASSET_ID]),
        ).rejects.toBe(fetchError);
      });
    });
  });

  describe('fetchAccountAssetByID', () => {
    it('returns the single fresh asset', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        (mockAssetsProvider.getAssets as jest.Mock).mockResolvedValue({
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
