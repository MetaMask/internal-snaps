import type { Asset, Caip19AssetId } from '@metamask/assets-controller';
import { AssetsProvider } from '@metamask/snap-networks-utils';

import { KnownCaip19Id, Network } from '../../../constants/solana';
import { CoreAssetsAdapter } from './CoreAssetsAdapter';

const ACCOUNT_ID = 'test-account-id';
const SOL_MAINNET_ASSET_ID = KnownCaip19Id.SolMainnet as Caip19AssetId;
const SOL_DEVNET_ASSET_ID = KnownCaip19Id.SolDevnet as Caip19AssetId;
const USDC_MAINNET_ASSET_ID = KnownCaip19Id.UsdcMainnet as Caip19AssetId;

/**
 * Builds a controller asset for adapter mapping tests.
 *
 * @param options - Fields to set on the controller asset.
 * @param options.id - CAIP-19 asset ID.
 * @param options.chainId - Chain ID. Defaults to Mainnet.
 * @param options.amount - UI balance amount (with decimals applied).
 * @param options.symbol - Asset symbol.
 * @param options.decimals - Asset decimals.
 * @returns A controller `Asset`.
 */
function createControllerAsset(options: {
  id: Caip19AssetId;
  chainId?: `${string}:${string}`;
  amount?: string;
  symbol?: string;
  decimals?: number;
}): Asset {
  const {
    id,
    chainId = Network.Mainnet,
    amount = '1',
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
} {
  const mockAssetsProvider = {
    getAccountAssetByID: jest.fn().mockResolvedValue(undefined),
    getAccountAssetsByIDs: jest.fn().mockResolvedValue({}),
    getAccountAssetsByScope: jest.fn().mockResolvedValue({}),
  };

  const adapter = new CoreAssetsAdapter({
    getAccountAssetByID: mockAssetsProvider.getAccountAssetByID,
    getAccountAssetsByIDs: mockAssetsProvider.getAccountAssetsByIDs,
    getAccountAssetsByScope: mockAssetsProvider.getAccountAssetsByScope,
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
        const controllerAsset = createControllerAsset({
          id: SOL_MAINNET_ASSET_ID,
        });
        mockAssetsProvider.getAccountAssetByID.mockResolvedValue(
          controllerAsset,
        );

        const asset = await adapter.getAccountAssetByID(
          ACCOUNT_ID,
          SOL_MAINNET_ASSET_ID,
        );

        expect(mockAssetsProvider.getAccountAssetByID).toHaveBeenCalledWith(
          ACCOUNT_ID,
          SOL_MAINNET_ASSET_ID,
        );
        expect(asset).toStrictEqual({
          assetType: SOL_MAINNET_ASSET_ID,
          keyringAccountId: ACCOUNT_ID,
          network: Network.Mainnet,
          address: '',
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
          SOL_MAINNET_ASSET_ID,
        );

        expect(asset).toBeNull();
      });
    });
  });

  describe('getAccountAssetsByIDs', () => {
    it('returns mapped assets in request order and null for missing IDs', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        const mainnetAsset = createControllerAsset({
          id: SOL_MAINNET_ASSET_ID,
        });
        mockAssetsProvider.getAccountAssetsByIDs.mockResolvedValue({
          [SOL_MAINNET_ASSET_ID]: mainnetAsset,
        });

        const assets = await adapter.getAccountAssetsByIDs(ACCOUNT_ID, [
          SOL_MAINNET_ASSET_ID,
          USDC_MAINNET_ASSET_ID,
        ]);

        expect(mockAssetsProvider.getAccountAssetsByIDs).toHaveBeenCalledWith(
          ACCOUNT_ID,
          [SOL_MAINNET_ASSET_ID, USDC_MAINNET_ASSET_ID],
        );
        expect(assets).toHaveLength(2);
        expect(assets[0]?.assetType).toBe(SOL_MAINNET_ASSET_ID);
        expect(assets[0]?.uiAmount).toBe('1');
        expect(assets[1]).toBeNull();
      });
    });
  });

  describe('getAccountAssetsByScope', () => {
    it('maps every controller asset for the requested scope', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        const solAsset = createControllerAsset({ id: SOL_MAINNET_ASSET_ID });
        const usdcAsset = createControllerAsset({
          id: USDC_MAINNET_ASSET_ID,
          symbol: 'USDC',
          decimals: 6,
          amount: '123.456789',
        });
        mockAssetsProvider.getAccountAssetsByScope.mockResolvedValue({
          [SOL_MAINNET_ASSET_ID]: solAsset,
          [USDC_MAINNET_ASSET_ID]: usdcAsset,
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
          [SOL_MAINNET_ASSET_ID, USDC_MAINNET_ASSET_ID].sort(),
        );
        expect(
          assets.every((asset) => asset.keyringAccountId === ACCOUNT_ID),
        ).toBe(true);
      });
    });
  });

  describe('getAccountAssets', () => {
    it('concatenates mapped assets from Mainnet and Devnet', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        const mainnetAsset = createControllerAsset({
          id: SOL_MAINNET_ASSET_ID,
        });
        const devnetAsset = createControllerAsset({
          id: SOL_DEVNET_ASSET_ID,
          chainId: Network.Devnet,
        });
        mockAssetsProvider.getAccountAssetsByScope.mockImplementation(
          async (scope: `${string}:${string}`) => {
            if (scope === Network.Mainnet) {
              return { [SOL_MAINNET_ASSET_ID]: mainnetAsset };
            }
            if (scope === Network.Devnet) {
              return { [SOL_DEVNET_ASSET_ID]: devnetAsset };
            }
            return {};
          },
        );

        const assets = await adapter.getAccountAssets(ACCOUNT_ID);

        expect(
          mockAssetsProvider.getAccountAssetsByScope,
        ).toHaveBeenCalledTimes(2);
        expect(mockAssetsProvider.getAccountAssetsByScope).toHaveBeenCalledWith(
          Network.Mainnet,
          ACCOUNT_ID,
        );
        expect(mockAssetsProvider.getAccountAssetsByScope).toHaveBeenCalledWith(
          Network.Devnet,
          ACCOUNT_ID,
        );
        expect(assets.map((asset) => asset.assetType)).toStrictEqual([
          SOL_MAINNET_ASSET_ID,
          SOL_DEVNET_ASSET_ID,
        ]);
      });
    });

    it('rejects when any scope request fails', async () => {
      await withCoreAssetsAdapter(async ({ adapter, mockAssetsProvider }) => {
        mockAssetsProvider.getAccountAssetsByScope.mockImplementation(
          async (scope: `${string}:${string}`) => {
            if (scope === Network.Devnet) {
              throw new Error('devnet failed');
            }
            return {};
          },
        );

        await expect(adapter.getAccountAssets(ACCOUNT_ID)).rejects.toThrow(
          'devnet failed',
        );
      });
    });
  });
});
