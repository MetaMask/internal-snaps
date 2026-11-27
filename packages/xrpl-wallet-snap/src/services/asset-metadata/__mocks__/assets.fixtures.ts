import { InMemoryState } from '@metamask/snap-networks-utils';

import type {
  KnownCaip19IouAssetId,
  KnownCaip19MptAssetId,
  KnownCaip19Slip44Id,
} from '../../../api';
import { AssetType, KnownCaip2ChainId } from '../../../api';
import {
  IOU_DECIMAL_PLACES,
  NATIVE_ASSET_NAME,
  NATIVE_ASSET_SYMBOL,
  XRPL_DECIMAL_PLACES,
} from '../../../constants';
import {
  getSlip44AssetId,
  toCaip19IouAssetId,
  toCaip19MptAssetId,
} from '../../../utils/caip';
import { logger } from '../../../utils/logger';
import type { AssetsService } from '../../assets';
import type { NetworkService } from '../../network/NetworkService';
import type { AssetMetadataByAssetId, MptXrplAssetMetadata } from '../api';
import { AssetMetadataRepository } from '../AssetMetadataRepository';
import { AssetMetadataService } from '../AssetMetadataService';

const scope = KnownCaip2ChainId.Mainnet;
const issuer = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';

export const NATIVE: KnownCaip19Slip44Id = getSlip44AssetId(scope);

export const USDC_IOU: KnownCaip19IouAssetId = toCaip19IouAssetId(
  scope,
  'USDC',
  issuer,
);

export const RLUSD_IOU: KnownCaip19IouAssetId = toCaip19IouAssetId(
  scope,
  '524C555344000000000000000000000000000000',
  issuer,
);

export const USDC_MPT: KnownCaip19MptAssetId = toCaip19MptAssetId(
  scope,
  '05FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3',
);

export const USDT_MPT: KnownCaip19MptAssetId = toCaip19MptAssetId(
  scope,
  '000000000000000000000000000000000000000000000001',
);

export const generateMockXrplAssetMetadata = (): AssetMetadataByAssetId => {
  return {
    [NATIVE]: {
      assetId: NATIVE,
      assetType: AssetType.Native,
      chainId: scope,
      name: NATIVE_ASSET_NAME,
      symbol: NATIVE_ASSET_SYMBOL,
      fungible: true,
      iconUrl: 'https://example.test/icon.png',
      units: [
        {
          name: NATIVE_ASSET_NAME,
          symbol: NATIVE_ASSET_SYMBOL,
          decimals: XRPL_DECIMAL_PLACES,
        },
      ],
    },
    [USDC_IOU]: {
      assetId: USDC_IOU,
      assetType: AssetType.Token,
      chainId: scope,
      name: 'USDC',
      symbol: 'USDC',
      fungible: true,
      iconUrl: 'https://example.test/icon.png',
      units: [{ name: 'USDC', symbol: 'USDC', decimals: IOU_DECIMAL_PLACES }],
    },
    [USDC_MPT]: {
      assetId: USDC_MPT,
      assetType: AssetType.Mpt,
      chainId: scope,
      name: 'USDC',
      symbol: 'USDC',
      fungible: true,
      iconUrl: 'https://example.test/icon.png',
      units: [{ name: 'USDC', symbol: 'USDC', decimals: 6 }],
    },
    [USDT_MPT]: {
      assetId: USDT_MPT,
      assetType: AssetType.Mpt,
      chainId: scope,
      name: 'USDT',
      symbol: 'USDT',
      fungible: true,
      iconUrl: 'https://example.test/icon.png',
      units: [{ name: 'USDT', symbol: 'USDT', decimals: 6 }],
    },
  } as AssetMetadataByAssetId;
};

export const getMockMptAssets = (): MptXrplAssetMetadata[] => {
  const metadata = generateMockXrplAssetMetadata();
  const usdcMpt = metadata[USDC_MPT];
  const usdtMpt = metadata[USDT_MPT];
  if (
    usdcMpt?.assetType !== AssetType.Mpt ||
    usdtMpt?.assetType !== AssetType.Mpt
  ) {
    throw new Error('expected MPT assets in mock metadata');
  }
  return [usdcMpt, usdtMpt];
};

export const createMockAssetMetadataService = () => {
  const assetsService = {
    getAssetMetadata: vi.fn().mockResolvedValue(null),
  } as unknown as AssetsService;

  const service = new AssetMetadataService({
    assetMetadataRepository: new AssetMetadataRepository(
      new InMemoryState({
        assets: generateMockXrplAssetMetadata(),
      }),
    ),
    logger,
    assetsService,
    networkService: {} as unknown as NetworkService,
  });

  const assetMetadataRepositorySaveManySpy = vi.spyOn(
    AssetMetadataRepository.prototype,
    'saveMany',
  );

  const assetMetadataRepositoryGetByAssetIdsSpy = vi.spyOn(
    AssetMetadataRepository.prototype,
    'getByAssetIds',
  );

  return {
    service,
    assetsService,
    assetMetadataRepositorySaveManySpy,
    assetMetadataRepositoryGetByAssetIdsSpy,
  };
};
