import type { Asset, AssetMetadata } from '@metamask/assets-controller';

import type { KnownCaip19AssetIdOrSlip44Id } from '../../api';
import { KnownCaip2ChainId } from '../../api';
import {
  IOU_DECIMAL_PLACES,
  NATIVE_ASSET_SYMBOL,
  XRPL_DECIMAL_PLACES,
} from '../../constants';
import { getSlip44AssetId } from '../../utils';
import {
  USDC_IOU,
  USDC_MPT,
} from '../asset-metadata/__mocks__/assets.fixtures';
import { createMockAssetsService } from './__mocks__/assetsService.fixtures';
import { InvalidCoreAssetException } from './exceptions';

const ACCOUNT_ID = 'acct-1';

const fungiblePrice = {
  assetPriceType: 'fungible' as const,
  price: 0,
  usdPrice: 0,
  lastUpdated: 0,
};

const nativeId = getSlip44AssetId(KnownCaip2ChainId.Mainnet);

const nativeAsset: Asset = {
  id: nativeId,
  chainId: KnownCaip2ChainId.Mainnet,
  balance: {
    amount: '5',
    metadata: {
      spendableBalance: '4000000',
      minimumReserveBalance: '1000000',
    },
  },
  metadata: {
    type: 'native',
    symbol: NATIVE_ASSET_SYMBOL,
    name: NATIVE_ASSET_SYMBOL,
    decimals: XRPL_DECIMAL_PLACES,
  },
  price: fungiblePrice,
  fiatValue: 0,
};

const iouAsset: Asset = {
  id: USDC_IOU,
  chainId: KnownCaip2ChainId.Mainnet,
  balance: {
    amount: '3',
    metadata: { limit: '1000000' },
  },
  metadata: {
    type: 'erc20',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: IOU_DECIMAL_PLACES,
  },
  price: fungiblePrice,
  fiatValue: 0,
};

const mptAsset: Asset = {
  id: USDC_MPT,
  chainId: KnownCaip2ChainId.Mainnet,
  balance: {
    amount: '2',
    metadata: { status: 0 },
  },
  metadata: {
    type: 'erc20',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
  },
  price: fungiblePrice,
  fiatValue: 0,
};

const ethereumAsset: Asset = {
  id: 'eip155:1/slip44:60',
  chainId: 'eip155:1',
  balance: { amount: '1' },
  metadata: {
    type: 'native',
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
  },
  price: fungiblePrice,
  fiatValue: 0,
};

const invalidIouAsset: Asset = {
  ...iouAsset,
  balance: { amount: '3' },
};

describe('AssetsService', () => {
  const assetId = USDC_IOU;
  const coreMetadata = {
    type: 'erc20' as const,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: IOU_DECIMAL_PLACES,
    image: 'https://example.test/usdc.png',
  };

  describe('getAssetMetadata', () => {
    it('parses Core catalog metadata into CoreAssetMetadata', async () => {
      const { service, coreAdapter } = createMockAssetsService();
      coreAdapter.getAssetMetadata.mockResolvedValue(coreMetadata);

      expect(await service.getAssetMetadata(assetId)).toMatchObject({
        symbol: 'USDC',
        decimals: IOU_DECIMAL_PLACES,
        name: 'USD Coin',
        image: 'https://example.test/usdc.png',
      });
      expect(coreAdapter.getAssetMetadata).toHaveBeenCalledWith(assetId);
    });

    it('returns null when Core misses', async () => {
      const { service, coreAdapter } = createMockAssetsService();

      expect(await service.getAssetMetadata(assetId)).toBeNull();
      expect(coreAdapter.getAssetMetadata).toHaveBeenCalledWith(assetId);
    });

    it('returns null when metadata is not valid', async () => {
      const { service, coreAdapter } = createMockAssetsService();
      coreAdapter.getAssetMetadata.mockResolvedValue({
        type: 'native',
        symbol: 'USDC',
        name: 'USD Coin',
      } as AssetMetadata);

      expect(await service.getAssetMetadata(assetId)).toBeNull();
    });
  });

  describe('getAccountAssetByID', () => {
    it('parses a Core account asset', async () => {
      const { service, coreAdapter } = createMockAssetsService();
      coreAdapter.getAccountAssetByID.mockResolvedValue(iouAsset);

      expect(
        await service.getAccountAssetByID(ACCOUNT_ID, USDC_IOU),
      ).toMatchObject({
        id: USDC_IOU,
        balance: {
          amount: '3',
          metadata: { limit: '1000000' },
        },
      });
      expect(coreAdapter.getAccountAssetByID).toHaveBeenCalledWith(
        ACCOUNT_ID,
        USDC_IOU,
      );
    });

    it('returns null when Core misses', async () => {
      const { service, coreAdapter } = createMockAssetsService();
      coreAdapter.getAccountAssetByID.mockResolvedValue(null);

      expect(
        await service.getAccountAssetByID(ACCOUNT_ID, USDC_IOU),
      ).toBeNull();
    });

    it('returns null when the asset is not Xrpl', async () => {
      const { service, coreAdapter } = createMockAssetsService();
      coreAdapter.getAccountAssetByID.mockResolvedValue(ethereumAsset);

      expect(
        await service.getAccountAssetByID(ACCOUNT_ID, USDC_IOU),
      ).toBeNull();
    });

    it('throws when an XRPL asset id has an invalid body', async () => {
      const { service, coreAdapter } = createMockAssetsService();
      coreAdapter.getAccountAssetByID.mockResolvedValue(invalidIouAsset);

      await expect(
        service.getAccountAssetByID(ACCOUNT_ID, USDC_IOU),
      ).rejects.toThrow(InvalidCoreAssetException);
    });
  });

  describe('getAccountAssetsByIDs', () => {
    it('returns an empty list without calling Core when no ids are given', async () => {
      const { service, coreAdapter } = createMockAssetsService();

      expect(await service.getAccountAssetsByIDs(ACCOUNT_ID, [])).toStrictEqual(
        [],
      );
      expect(coreAdapter.getAccountAssetsByIDs).not.toHaveBeenCalled();
    });

    it('parses each id and keeps null for a non-Xrpl row', async () => {
      const { service, coreAdapter } = createMockAssetsService();
      coreAdapter.getAccountAssetsByIDs.mockResolvedValue([
        iouAsset,
        ethereumAsset,
      ]);

      expect(
        await service.getAccountAssetsByIDs(ACCOUNT_ID, [
          USDC_IOU,
          'eip155:1/slip44:60' as KnownCaip19AssetIdOrSlip44Id,
        ]),
      ).toMatchObject([
        {
          id: USDC_IOU,
          metadata: { symbol: 'USDC', decimals: IOU_DECIMAL_PLACES },
        },
        null,
      ]);
    });
  });

  describe('getAccountAssetsByScope', () => {
    it('parses Xrpl rows and drops other chains', async () => {
      const { service, coreAdapter } = createMockAssetsService();
      coreAdapter.getAccountAssetsByScope.mockResolvedValue([
        nativeAsset,
        iouAsset,
        mptAsset,
        ethereumAsset,
      ]);

      expect(
        await service.getAccountAssetsByScope(
          KnownCaip2ChainId.Mainnet,
          ACCOUNT_ID,
        ),
      ).toMatchObject([
        {
          id: nativeId,
          balance: {
            metadata: {
              spendableBalance: '4000000',
              minimumReserveBalance: '1000000',
            },
          },
        },
        {
          id: USDC_IOU,
          balance: {
            metadata: { limit: '1000000' },
          },
        },
        { id: USDC_MPT, balance: { amount: '2', metadata: { status: 0 } } },
      ]);
    });
  });

  describe('getAccountAssets', () => {
    it('parses Xrpl rows and drops other chains', async () => {
      const { service, coreAdapter } = createMockAssetsService();
      coreAdapter.getAccountAssets.mockResolvedValue([
        nativeAsset,
        ethereumAsset,
      ]);

      expect(await service.getAccountAssets(ACCOUNT_ID)).toMatchObject([
        { id: nativeId },
      ]);
      expect(coreAdapter.getAccountAssets).toHaveBeenCalledWith(ACCOUNT_ID);
    });
  });
});
