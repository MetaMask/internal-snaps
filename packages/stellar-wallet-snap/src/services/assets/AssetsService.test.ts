import { SnapsAssetsMigrationStage } from '@metamask/assets-controller';
import type { Asset } from '@metamask/assets-controller';
import type { RemoteFeatureFlagsProvider } from '@metamask/snap-networks-utils';

import { KnownCaip2ChainId } from '../../api';
import { getSlip44AssetId } from '../../utils';
import {
  USDC_CLASSIC,
  USDC_SEP41,
} from '../asset-metadata/__mocks__/assets.fixtures';
import type { CoreAssetsAdapter } from './adapters/CoreAssetsAdapter';
import { AssetsService } from './AssetsService';
import { createMockAssetsService } from './__mocks__/assetsService.fixtures';

describe('AssetsService', () => {
  const assetId = USDC_CLASSIC;
  const coreMetadata = {
    symbol: 'USDC',
    decimals: 7,
    address: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  };

  it('parses Core catalog metadata into CoreAssetMetadata', async () => {
    const { service, getAssetMetadata } = createMockAssetsService();
    getAssetMetadata.mockResolvedValue({
      ...coreMetadata,
      name: 'USD Coin',
      image: 'https://example.test/usdc.png',
    });

    await expect(service.getAssetMetadata(assetId)).resolves.toMatchObject(
      coreMetadata,
    );
    expect(getAssetMetadata).toHaveBeenCalledWith(assetId);
  });

  it('returns null when Core misses', async () => {
    const { service, getAssetMetadata } = createMockAssetsService();

    await expect(service.getAssetMetadata(assetId)).resolves.toBeNull();
    expect(getAssetMetadata).toHaveBeenCalledWith(assetId);
  });

  it('returns null when Core metadata is not Stellar-shaped', async () => {
    const { service, getAssetMetadata } = createMockAssetsService();
    getAssetMetadata.mockResolvedValue({ symbol: 'USDC' });

    await expect(service.getAssetMetadata(assetId)).resolves.toBeNull();
  });

  it('validates account assets into CoreAsset and drops invalid rows', async () => {
    const nativeId = getSlip44AssetId(KnownCaip2ChainId.Mainnet);
    const getAccountAssetsByScope = jest.fn().mockResolvedValue([
      {
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
        metadata: { symbol: 'XLM', decimals: 7 },
        price: { value: 0, currency: 'usd' },
        fiatValue: 0,
      },
      {
        id: USDC_CLASSIC,
        chainId: KnownCaip2ChainId.Mainnet,
        balance: {
          amount: '3',
          metadata: { limit: '1000', authorized: true, sponsored: false },
        },
        metadata: { symbol: 'USDC', decimals: 7 },
      },
      {
        id: USDC_SEP41,
        chainId: KnownCaip2ChainId.Mainnet,
        balance: { amount: '2' },
        metadata: { symbol: 'USDC', decimals: 7 },
      },
      {
        id: 'eip155:1/slip44:60',
        chainId: 'eip155:1',
        balance: { amount: '1' },
        metadata: { symbol: 'ETH', decimals: 18 },
      },
    ] as Asset[]);

    const coreAdapter = {
      getAssetMetadata: jest.fn(),
      getAccountAssetsByScope,
    } as unknown as CoreAssetsAdapter;

    const remoteFeatureFlagsProvider = {
      getFeatureFlag: jest.fn().mockResolvedValue({
        value: { stage: SnapsAssetsMigrationStage.Off },
      }),
    } as unknown as RemoteFeatureFlagsProvider;

    const service = new AssetsService({
      coreAdapter,
      remoteFeatureFlagsProvider,
    });

    await expect(
      service.getAccountAssetsByScope(KnownCaip2ChainId.Mainnet, 'acct-1'),
    ).resolves.toMatchObject([
      {
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
        metadata: { symbol: 'XLM', decimals: 7 },
        price: { value: 0, currency: 'usd' },
        fiatValue: 0,
      },
      {
        id: USDC_CLASSIC,
        chainId: KnownCaip2ChainId.Mainnet,
        balance: {
          amount: '3',
          metadata: { limit: '1000', authorized: true, sponsored: false },
        },
        metadata: { symbol: 'USDC', decimals: 7 },
      },
      {
        id: USDC_SEP41,
        chainId: KnownCaip2ChainId.Mainnet,
        balance: { amount: '2' },
        metadata: { symbol: 'USDC', decimals: 7 },
      },
    ]);
  });
});
