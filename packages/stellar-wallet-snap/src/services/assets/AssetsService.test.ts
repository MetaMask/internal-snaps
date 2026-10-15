import type { Asset, AssetMetadata } from '@metamask/assets-controller';
import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
} from '@metamask/assets-controller';

import { KnownCaip19AssetIdOrSlip44Id, KnownCaip2ChainId } from '../../api';
import { MAX_INT64 } from '../../constants';
import { getSlip44AssetId } from '../../utils';
import {
  USDC_CLASSIC,
  USDC_SEP41,
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
      spendableBalance: '40000000',
      minimumReserveBalance: '10000000',
      decimal: 7,
    },
  },
  metadata: {
    type: 'native',
    symbol: 'XLM',
    name: 'XLM',
    decimals: 7,
  },
  price: fungiblePrice,
  fiatValue: 0,
};

const classicAsset: Asset = {
  id: USDC_CLASSIC,
  chainId: KnownCaip2ChainId.Mainnet,
  balance: {
    amount: '3',
    metadata: { limit: MAX_INT64, authorized: true, sponsored: false },
  },
  metadata: {
    type: 'erc20',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 7,
  },
  price: fungiblePrice,
  fiatValue: 0,
};

const sep41Asset: Asset = {
  id: USDC_SEP41,
  chainId: KnownCaip2ChainId.Mainnet,
  balance: { amount: '2' },
  metadata: {
    type: 'erc20',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 7,
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

const invalidClassicAsset: Asset = {
  ...classicAsset,
  balance: { amount: '3' },
};

describe('AssetsService', () => {
  const assetId = USDC_CLASSIC;
  const coreMetadata = {
    type: 'erc20' as const,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 7,
    image: 'https://example.test/usdc.png',
  };

  describe('isMigrationEnabled', () => {
    it('returns false when the Stellar flag is Off', async () => {
      const { service, remoteFeatureFlagsProvider } = createMockAssetsService();

      expect(await service.isMigrationEnabled()).toBe(false);
      expect(remoteFeatureFlagsProvider.getFeatureFlag).toHaveBeenCalledWith(
        SNAPS_ASSETS_MIGRATION_FLAG_KEYS.stellar,
      );
    });

    it('returns true when the Stellar flag is active', async () => {
      const { service } = createMockAssetsService({
        migrationStage: SnapsAssetsMigrationStage.ReadAssetsControllerOnly,
      });

      expect(await service.isMigrationEnabled()).toBe(true);
    });
  });

  describe('getAssetMetadata', () => {
    it('parses Core catalog metadata into CoreAssetMetadata', async () => {
      const { service, coreAdapter } = createMockAssetsService();
      coreAdapter.getAssetMetadata.mockResolvedValue(coreMetadata);

      expect(await service.getAssetMetadata(assetId)).toMatchObject({
        symbol: 'USDC',
        decimals: 7,
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
      // Omit decimals
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
      coreAdapter.getAccountAssetByID.mockResolvedValue(classicAsset);

      expect(
        await service.getAccountAssetByID(ACCOUNT_ID, USDC_CLASSIC),
      ).toMatchObject({
        id: USDC_CLASSIC,
        balance: {
          amount: '3',
          metadata: { limit: MAX_INT64, authorized: true, sponsored: false },
        },
      });
      expect(coreAdapter.getAccountAssetByID).toHaveBeenCalledWith(
        ACCOUNT_ID,
        USDC_CLASSIC,
      );
    });

    it('returns null when Core misses', async () => {
      const { service, coreAdapter } = createMockAssetsService();
      coreAdapter.getAccountAssetByID.mockResolvedValue(null);

      expect(
        await service.getAccountAssetByID(ACCOUNT_ID, USDC_CLASSIC),
      ).toBeNull();
    });

    it('returns null when the asset is not Stellar', async () => {
      const { service, coreAdapter } = createMockAssetsService();
      coreAdapter.getAccountAssetByID.mockResolvedValue(ethereumAsset);

      expect(
        await service.getAccountAssetByID(ACCOUNT_ID, USDC_CLASSIC),
      ).toBeNull();
    });

    it('throws when a Stellar asset id has an invalid body', async () => {
      const { service, coreAdapter } = createMockAssetsService();
      coreAdapter.getAccountAssetByID.mockResolvedValue(invalidClassicAsset);

      await expect(
        service.getAccountAssetByID(ACCOUNT_ID, USDC_CLASSIC),
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

    it('parses each id and keeps null for a non-Stellar row', async () => {
      const { service, coreAdapter } = createMockAssetsService();
      coreAdapter.getAccountAssetsByIDs.mockResolvedValue([
        classicAsset,
        ethereumAsset,
      ]);

      expect(
        await service.getAccountAssetsByIDs(ACCOUNT_ID, [
          USDC_CLASSIC,
          'eip155:1/slip44:60' as KnownCaip19AssetIdOrSlip44Id,
        ]),
      ).toMatchObject([
        { id: USDC_CLASSIC, metadata: { symbol: 'USDC', decimals: 7 } },
        null,
      ]);
    });
  });

  describe('getAccountAssetsByScope', () => {
    it('parses Stellar rows and drops other chains', async () => {
      const { service, coreAdapter } = createMockAssetsService();
      coreAdapter.getAccountAssetsByScope.mockResolvedValue([
        nativeAsset,
        classicAsset,
        sep41Asset,
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
              spendableBalance: '40000000',
              minimumReserveBalance: '10000000',
            },
          },
        },
        {
          id: USDC_CLASSIC,
          balance: {
            metadata: { limit: MAX_INT64, authorized: true, sponsored: false },
          },
        },
        { id: USDC_SEP41, balance: { amount: '2' } },
      ]);
    });
  });

  describe('getAccountAssets', () => {
    it('parses Stellar rows and drops other chains', async () => {
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
