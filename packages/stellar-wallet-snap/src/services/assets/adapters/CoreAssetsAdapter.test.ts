import type { Asset, AssetMetadata } from '@metamask/assets-controller';
import type { Logger } from '@metamask/snap-networks-utils';

import { KnownCaip2ChainId } from '../../../api';
import { getSlip44AssetId } from '../../../utils';
import { CoreAssetsAdapterException } from '../exceptions';
import { CoreAssetsAdapter } from './CoreAssetsAdapter';

const ACCOUNT_ID = 'acct-1';
const MAINNET_ASSET_ID = getSlip44AssetId(KnownCaip2ChainId.Mainnet);
const TESTNET_ASSET_ID = getSlip44AssetId(KnownCaip2ChainId.Testnet);

const fungiblePrice = {
  assetPriceType: 'fungible' as const,
  price: 0,
  usdPrice: 0,
  lastUpdated: 0,
};

const metadata: AssetMetadata = {
  type: 'native',
  symbol: 'XLM',
  name: 'Stellar',
  decimals: 7,
};

function coreAsset(
  id: typeof MAINNET_ASSET_ID,
  chainId: KnownCaip2ChainId,
): Asset {
  return {
    id,
    chainId,
    balance: { amount: '1' },
    metadata,
    price: fungiblePrice,
    fiatValue: 0,
  };
}

const mainnetAsset = coreAsset(MAINNET_ASSET_ID, KnownCaip2ChainId.Mainnet);
const testnetAsset = coreAsset(TESTNET_ASSET_ID, KnownCaip2ChainId.Testnet);

function createAdapter(): {
  adapter: CoreAssetsAdapter;
  getAccountAssetByID: jest.Mock;
  getAccountAssetsByIDs: jest.Mock;
  getAccountAssetsByScope: jest.Mock;
  getAssetMetadata: jest.Mock;
} {
  const logger = {
    debug: jest.fn(),
    withPrefix: jest.fn(),
  } as unknown as Logger;
  (logger.withPrefix as jest.Mock).mockReturnValue(logger);

  const getAccountAssetByID = jest.fn();
  const getAccountAssetsByIDs = jest.fn();
  const getAccountAssetsByScope = jest.fn();
  const getAssetMetadata = jest.fn();

  const adapter = new CoreAssetsAdapter({
    logger,
    getAccountAssetByID,
    getAccountAssetsByIDs,
    getAccountAssetsByScope,
    getAssetMetadata,
  });

  return {
    adapter,
    getAccountAssetByID,
    getAccountAssetsByIDs,
    getAccountAssetsByScope,
    getAssetMetadata,
  };
}

describe('CoreAssetsAdapter', () => {
  describe('getAccountAssetByID', () => {
    it('returns the controller asset', async () => {
      const { adapter, getAccountAssetByID } = createAdapter();
      getAccountAssetByID.mockResolvedValue(mainnetAsset);

      expect(
        await adapter.getAccountAssetByID(ACCOUNT_ID, MAINNET_ASSET_ID),
      ).toBe(mainnetAsset);
      expect(getAccountAssetByID).toHaveBeenCalledWith(
        ACCOUNT_ID,
        MAINNET_ASSET_ID,
      );
    });

    it('returns null when Core has no account asset', async () => {
      const { adapter, getAccountAssetByID } = createAdapter();
      getAccountAssetByID.mockResolvedValue(undefined);

      expect(
        await adapter.getAccountAssetByID(ACCOUNT_ID, MAINNET_ASSET_ID),
      ).toBeNull();
    });

    it('throws CoreAssetsAdapterException when Core fails', async () => {
      const { adapter, getAccountAssetByID } = createAdapter();
      getAccountAssetByID.mockRejectedValue(new Error('messenger down'));

      await expect(
        adapter.getAccountAssetByID(ACCOUNT_ID, MAINNET_ASSET_ID),
      ).rejects.toThrow(CoreAssetsAdapterException);
    });
  });

  describe('getAccountAssetsByIDs', () => {
    it('returns assets in id order and null for a miss', async () => {
      const { adapter, getAccountAssetsByIDs } = createAdapter();
      getAccountAssetsByIDs.mockResolvedValue({
        [MAINNET_ASSET_ID]: mainnetAsset,
      });

      expect(
        await adapter.getAccountAssetsByIDs(ACCOUNT_ID, [
          MAINNET_ASSET_ID,
          TESTNET_ASSET_ID,
        ]),
      ).toStrictEqual([mainnetAsset, null]);
    });

    it('throws CoreAssetsAdapterException when Core fails', async () => {
      const { adapter, getAccountAssetsByIDs } = createAdapter();
      getAccountAssetsByIDs.mockRejectedValue(new Error('messenger down'));

      await expect(
        adapter.getAccountAssetsByIDs(ACCOUNT_ID, [MAINNET_ASSET_ID]),
      ).rejects.toThrow(CoreAssetsAdapterException);
    });
  });

  describe('getAccountAssetsByScope', () => {
    it('returns the controller assets for the scope', async () => {
      const { adapter, getAccountAssetsByScope } = createAdapter();
      getAccountAssetsByScope.mockResolvedValue({
        [MAINNET_ASSET_ID]: mainnetAsset,
      });

      expect(
        await adapter.getAccountAssetsByScope(
          KnownCaip2ChainId.Mainnet,
          ACCOUNT_ID,
        ),
      ).toStrictEqual([mainnetAsset]);
      expect(getAccountAssetsByScope).toHaveBeenCalledWith(
        KnownCaip2ChainId.Mainnet,
        ACCOUNT_ID,
      );
    });

    it('throws CoreAssetsAdapterException when Core fails', async () => {
      const { adapter, getAccountAssetsByScope } = createAdapter();
      getAccountAssetsByScope.mockRejectedValue(new Error('messenger down'));

      await expect(
        adapter.getAccountAssetsByScope(KnownCaip2ChainId.Mainnet, ACCOUNT_ID),
      ).rejects.toThrow(CoreAssetsAdapterException);
    });
  });

  describe('getAccountAssets', () => {
    it('returns mainnet and testnet assets', async () => {
      const { adapter, getAccountAssetsByScope } = createAdapter();
      getAccountAssetsByScope.mockImplementation(async (scope: string) => {
        if (scope === KnownCaip2ChainId.Mainnet) {
          return { [MAINNET_ASSET_ID]: mainnetAsset };
        }
        return { [TESTNET_ASSET_ID]: testnetAsset };
      });

      expect(await adapter.getAccountAssets(ACCOUNT_ID)).toStrictEqual([
        mainnetAsset,
        testnetAsset,
      ]);
    });

    it('keeps the scope error when a network read fails', async () => {
      const { adapter, getAccountAssetsByScope } = createAdapter();
      getAccountAssetsByScope.mockImplementation(async (scope: string) => {
        if (scope === KnownCaip2ChainId.Mainnet) {
          throw new Error('messenger down');
        }
        return {};
      });

      await expect(adapter.getAccountAssets(ACCOUNT_ID)).rejects.toThrow(
        CoreAssetsAdapterException,
      );
    });
  });

  describe('getAssetMetadata', () => {
    it('returns controller metadata', async () => {
      const { adapter, getAssetMetadata } = createAdapter();
      getAssetMetadata.mockResolvedValue(metadata);

      expect(await adapter.getAssetMetadata(MAINNET_ASSET_ID)).toBe(metadata);
      expect(getAssetMetadata).toHaveBeenCalledWith(MAINNET_ASSET_ID);
    });

    it('returns null when Core has no metadata', async () => {
      const { adapter, getAssetMetadata } = createAdapter();
      getAssetMetadata.mockResolvedValue(undefined);

      expect(await adapter.getAssetMetadata(MAINNET_ASSET_ID)).toBeNull();
    });

    it('throws CoreAssetsAdapterException when Core fails', async () => {
      const { adapter, getAssetMetadata } = createAdapter();
      getAssetMetadata.mockRejectedValue(new Error('messenger down'));

      await expect(adapter.getAssetMetadata(MAINNET_ASSET_ID)).rejects.toThrow(
        CoreAssetsAdapterException,
      );
    });
  });
});
