import { buildUrl } from '@metamask/snap-networks-utils';

import type {
  KnownCaip19ClassicAssetId,
  KnownCaip19Sep41AssetId,
} from '../../api';
import { AssetType, KnownCaip2ChainId } from '../../api';
import { getSlip44AssetId, logger } from '../../utils';
import { createMockAssetsService } from '../assets/__mocks__/assetsService.fixtures';
import { USDC_SEP41 } from './__mocks__/assets.fixtures';
import type {
  ClassicStellarAssetMetadata,
  Sep41StellarAssetMetadata,
} from './api';
import type { AssetMetadataRepository } from './AssetMetadataRepository';
import { AssetMetadataService } from './AssetMetadataService';
import { AssetMetadataServiceException } from './exceptions';
import type { TokenMetadata } from './token-api/api';
import { TokenApiClient } from './token-api/TokenApiClient';
import { toStellarAssetMetadata } from './utils';

/** Mainnet classic USDC (matches CAIP-19 pattern used across Stellar fixtures). */
const MAINNET_CLASSIC_USDC =
  'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as KnownCaip19ClassicAssetId;

jest.mock('../../config', () => ({
  AppConfig: {
    api: {
      tokenApi: {
        baseUrl: 'https://tokens.test',
      },
      staticApi: {
        baseUrl: 'https://static.test',
      },
    },
    cache: {
      ttlMilliseconds: {
        // 1 hour — matches default `assetMetadata` TTL
        assetMetadata: 60 * 60 * 1000,
      },
    },
  },
}));

jest.mock('../../utils/logger');

jest.mock('./token-api/TokenApiClient', () => ({
  TokenApiClient: jest.fn(),
}));

const mockGetAssetsByAssetIds = jest.fn();
const mockGetAssetsByChainId = jest.fn();

function createCachedRow(
  assetId: KnownCaip19ClassicAssetId,
  chainId: KnownCaip2ChainId,
): ClassicStellarAssetMetadata {
  return {
    assetId,
    assetType: AssetType.Token,
    chainId,
    name: 'Cached',
    symbol: 'CCH',
    fungible: true,
    iconUrl: 'https://example.test/icon.png',
    units: [{ name: 'Cached', symbol: 'CCH', decimals: 7 }],
  };
}

function createService(deps: { repo?: Partial<AssetMetadataRepository> }) {
  const defaults = {
    getByAssetIds: jest.fn().mockResolvedValue([]),
    saveMany: jest.fn().mockResolvedValue(undefined),
    getByAssetType: jest.fn().mockResolvedValue([]),
    getAll: jest.fn().mockResolvedValue([]),
    getAllByScope: jest.fn().mockResolvedValue([]),
    getByAssetId: jest.fn().mockResolvedValue(null),
    isStale: jest.fn().mockResolvedValue(false),
  };

  const repo = {
    ...defaults,
    ...deps.repo,
  } as unknown as AssetMetadataRepository;

  (TokenApiClient as jest.Mock).mockImplementation(() => ({
    getAssetsByAssetIds: mockGetAssetsByAssetIds,
    getAssetsByChainId: mockGetAssetsByChainId,
  }));

  const { service: assetsService } = createMockAssetsService();
  const service = new AssetMetadataService({
    assetMetadataRepository: repo,
    logger,
    assetsService,
  });

  return {
    service,
    assetsService,
    getByAssetIds: repo.getByAssetIds as jest.MockedFunction<
      AssetMetadataRepository['getByAssetIds']
    >,
    saveMany: repo.saveMany as jest.MockedFunction<
      AssetMetadataRepository['saveMany']
    >,
  };
}

describe('AssetMetadataService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAssetsByAssetIds.mockResolvedValue([]);
    mockGetAssetsByChainId.mockResolvedValue({
      data: [],
      count: 0,
      totalCount: 0,
    });
  });

  it('returns native metadata for mainnet slip44 id', async () => {
    const { service, getByAssetIds } = createService({});
    const slipId = getSlip44AssetId(KnownCaip2ChainId.Mainnet);
    const result = await service.resolve(slipId);

    expect(result.assetId).toBe(slipId);
    expect(getByAssetIds).not.toHaveBeenCalled();
    expect(mockGetAssetsByAssetIds).not.toHaveBeenCalled();
  });

  it('throws when the token API does not return metadata for a mainnet classic asset', async () => {
    const { service } = createService({});

    await expect(service.resolve(MAINNET_CLASSIC_USDC)).rejects.toThrow(
      AssetMetadataServiceException,
    );
    expect(mockGetAssetsByAssetIds).toHaveBeenCalledWith([
      MAINNET_CLASSIC_USDC,
    ]);
  });

  it('returns cached mainnet classic asset without calling token API', async () => {
    const classicId = MAINNET_CLASSIC_USDC;
    const cached = createCachedRow(classicId, KnownCaip2ChainId.Mainnet);
    const { service, assetsService, getByAssetIds, saveMany } = createService({
      repo: {
        getByAssetIds: jest.fn().mockResolvedValue([cached]),
      },
    });
    jest.spyOn(assetsService, 'isMigrationEnabled').mockResolvedValue(false);
    const getAssetMetadata = jest
      .spyOn(assetsService, 'getAssetMetadata')
      .mockResolvedValue({
        symbol: 'USDC',
        decimals: 7,
        name: 'USD Coin',
      });

    const result = await service.resolve(classicId);

    expect(result).toStrictEqual(cached);
    expect(getAssetMetadata).not.toHaveBeenCalled();
    expect(getByAssetIds).toHaveBeenCalledWith([classicId]);
    expect(mockGetAssetsByAssetIds).not.toHaveBeenCalled();
    expect(saveMany).not.toHaveBeenCalled();
  });

  it('resolves requested SEP-41 metadata and persists it', async () => {
    const tokenRow: TokenMetadata = {
      assetId: USDC_SEP41,
      decimals: 7,
      name: 'USDC',
      symbol: 'USDC',
    };
    const { service, saveMany } = createService({});
    mockGetAssetsByAssetIds.mockResolvedValueOnce([tokenRow]);

    const result = await service.fetchAssetsByAssetIds([USDC_SEP41]);

    expect(result).toStrictEqual([
      expect.objectContaining({
        assetId: USDC_SEP41,
        name: 'USDC',
        symbol: 'USDC',
        assetType: AssetType.Sep41,
      }),
    ]);
    expect(mockGetAssetsByAssetIds).toHaveBeenCalledWith([USDC_SEP41]);
    expect(saveMany).toHaveBeenCalledWith([
      expect.objectContaining({
        assetId: USDC_SEP41,
        symbol: 'USDC',
      }),
    ]);
  });

  it('delegates getPersistedSep41AssetsMetadata to repository', async () => {
    const sepRows: Sep41StellarAssetMetadata[] = [];
    const getByAssetType = jest.fn().mockResolvedValue(sepRows);
    const { service } = createService({
      repo: { getByAssetType },
    });

    const result = await service.getPersistedSep41AssetsMetadata(
      KnownCaip2ChainId.Mainnet,
    );

    expect(result).toBe(sepRows);
    expect(getByAssetType).toHaveBeenCalledWith(
      AssetType.Sep41,
      KnownCaip2ChainId.Mainnet,
    );
  });

  it('resolves mainnet classic from token API when API returns metadata', async () => {
    const classicId = MAINNET_CLASSIC_USDC;
    const tokenRow: TokenMetadata = {
      assetId: classicId,
      decimals: 7,
      name: 'USD Coin',
      symbol: 'USDC',
    };
    const { service, saveMany } = createService({});
    mockGetAssetsByAssetIds.mockResolvedValueOnce([tokenRow]);

    const result = await service.resolve(classicId);

    expect(result).toMatchObject({
      assetId: classicId,
      name: 'USD Coin',
      symbol: 'USDC',
      chainId: KnownCaip2ChainId.Mainnet,
      assetType: AssetType.Token,
      fungible: true,
      units: [{ name: 'USD Coin', symbol: 'USDC', decimals: 7 }],
      iconUrl: buildUrl({
        baseUrl: 'https://static.test',
        path: '/api/v2/tokenIcons/assets/{assetId}.png',
        pathParams: {
          assetId: classicId.replace(/:/gu, '/'),
        },
        encodePathParams: false,
      }),
    });
    expect(saveMany).toHaveBeenCalledWith([
      expect.objectContaining({ assetId: classicId }),
    ]);
  });

  it('maps UNKNOWN name and symbol when token API omits them', async () => {
    const classicId = MAINNET_CLASSIC_USDC;
    const tokenRow: TokenMetadata = {
      assetId: classicId,
      decimals: 7,
    };
    const { service } = createService({});
    mockGetAssetsByAssetIds.mockResolvedValueOnce([tokenRow]);

    const result = await service.resolve(classicId);

    expect(result).toMatchObject({
      name: 'UNKNOWN',
      symbol: 'UNKNOWN',
      units: [{ name: 'UNKNOWN', symbol: 'UNKNOWN', decimals: 7 }],
    });
  });

  it('uses token API iconUrl when provided', async () => {
    const classicId = MAINNET_CLASSIC_USDC;
    const iconUrl = 'https://cdn.example/token.png';
    const tokenRow: TokenMetadata = {
      assetId: classicId,
      decimals: 7,
      name: 'USD Coin',
      symbol: 'USDC',
      iconUrl,
    };
    const { service } = createService({});
    mockGetAssetsByAssetIds.mockResolvedValueOnce([tokenRow]);

    const result = await service.resolve(classicId);

    expect(result.iconUrl).toBe(iconUrl);
  });

  it('persists mapped assets from token API during synchronize', async () => {
    const sep41AssetId =
      'stellar:pubnet/sep41:CAUP7NFABXE5TJRL3FKTPMWRLC7IAXYDCTHQRFSCLR5TMGKHOOQO772J' as KnownCaip19Sep41AssetId;
    const tokenRow: TokenMetadata = {
      assetId: sep41AssetId,
      decimals: 7,
      name: 'Token A',
      symbol: 'TA',
    };
    const { service, saveMany } = createService({});
    mockGetAssetsByChainId.mockResolvedValueOnce({
      data: [tokenRow],
      count: 1,
      totalCount: 1,
    });

    await service.synchronize(KnownCaip2ChainId.Mainnet);

    expect(mockGetAssetsByChainId).toHaveBeenCalledWith(
      KnownCaip2ChainId.Mainnet,
    );
    expect(saveMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          assetId: sep41AssetId,
          name: 'Token A',
          symbol: 'TA',
          assetType: AssetType.Sep41,
          chainId: KnownCaip2ChainId.Mainnet,
        }),
      ],
      true,
    );
  });

  describe('fetchSep41AssetsOrSyncOnce', () => {
    const sep41AssetId =
      'stellar:pubnet/sep41:CAUP7NFABXE5TJRL3FKTPMWRLC7IAXYDCTHQRFSCLR5TMGKHOOQO772J' as KnownCaip19Sep41AssetId;

    const freshCatalogRow = (): Sep41StellarAssetMetadata => ({
      assetId: sep41AssetId,
      assetType: AssetType.Sep41,
      chainId: KnownCaip2ChainId.Mainnet,
      name: 'Cached',
      symbol: 'CCH',
      fungible: true,
      iconUrl: 'https://example.test/icon.png',
      units: [{ name: 'Cached', symbol: 'CCH', decimals: 7 }],
      persistedAt: Date.now(),
    });

    it('synchronizes when the catalog is stale', async () => {
      const sepRows = [freshCatalogRow()];
      const isStale = jest.fn().mockResolvedValue(true);
      const getByAssetType = jest.fn().mockResolvedValue(sepRows);
      const { service, saveMany } = createService({
        repo: { isStale, getByAssetType },
      });
      mockGetAssetsByChainId.mockResolvedValueOnce({
        data: [
          {
            assetId: sep41AssetId,
            decimals: 7,
            name: 'Token A',
            symbol: 'TA',
          },
        ],
        count: 1,
        totalCount: 1,
      });

      const result = await service.fetchSep41AssetsOrSyncOnce(
        KnownCaip2ChainId.Mainnet,
      );

      expect(isStale).toHaveBeenCalledWith(60 * 60 * 1000);
      expect(mockGetAssetsByChainId).toHaveBeenCalledWith(
        KnownCaip2ChainId.Mainnet,
      );
      expect(saveMany).toHaveBeenCalledWith(
        [expect.objectContaining({ assetId: sep41AssetId })],
        true,
      );
      expect(result).toBe(sepRows);
    });

    it('returns persisted SEP-41 assets without syncing when the catalog is fresh', async () => {
      const catalog = [freshCatalogRow()];
      const isStale = jest.fn().mockResolvedValue(false);
      const getByAssetType = jest.fn().mockResolvedValue(catalog);
      const { service, saveMany } = createService({
        repo: { isStale, getByAssetType },
      });

      const result = await service.fetchSep41AssetsOrSyncOnce(
        KnownCaip2ChainId.Mainnet,
      );

      expect(isStale).toHaveBeenCalledWith(60 * 60 * 1000);
      expect(mockGetAssetsByChainId).not.toHaveBeenCalled();
      expect(saveMany).not.toHaveBeenCalled();
      expect(result).toBe(catalog);
    });
  });

  it('persists catalog during synchronize when assets migration is on', async () => {
    const sep41AssetId =
      'stellar:pubnet/sep41:CAUP7NFABXE5TJRL3FKTPMWRLC7IAXYDCTHQRFSCLR5TMGKHOOQO772J' as KnownCaip19Sep41AssetId;
    const { service, assetsService, saveMany } = createService({});
    jest.spyOn(assetsService, 'isMigrationEnabled').mockResolvedValue(true);
    mockGetAssetsByChainId.mockResolvedValueOnce({
      data: [
        {
          assetId: sep41AssetId,
          decimals: 7,
          name: 'Token A',
          symbol: 'TA',
        },
      ],
      count: 1,
      totalCount: 1,
    });

    await service.synchronize(KnownCaip2ChainId.Mainnet);

    expect(mockGetAssetsByChainId).toHaveBeenCalledWith(
      KnownCaip2ChainId.Mainnet,
    );
    expect(saveMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          assetId: sep41AssetId,
          name: 'Token A',
          symbol: 'TA',
        }),
      ],
      true,
    );
  });

  it('maps AssetsController catalog metadata into StellarAssetMetadata without reading snap state', async () => {
    const classicId = MAINNET_CLASSIC_USDC;
    const { service, assetsService, getByAssetIds, saveMany } = createService(
      {},
    );
    jest.spyOn(assetsService, 'isMigrationEnabled').mockResolvedValue(true);
    const getAssetMetadata = jest
      .spyOn(assetsService, 'getAssetMetadata')
      .mockResolvedValue({
        symbol: 'USDC',
        decimals: 7,
        name: 'USD Coin',
      });

    const result = await service.resolve(classicId);

    expect(result).toStrictEqual(
      toStellarAssetMetadata({
        assetId: classicId,
        decimals: 7,
        symbol: 'USDC',
        name: 'USD Coin',
      }),
    );
    expect(getAssetMetadata).toHaveBeenCalledWith(classicId);
    expect(getByAssetIds).not.toHaveBeenCalled();
    expect(mockGetAssetsByAssetIds).not.toHaveBeenCalled();
    expect(saveMany).not.toHaveBeenCalled();
  });

  it('falls back to snap catalog when AssetsController misses', async () => {
    const classicId = MAINNET_CLASSIC_USDC;
    const cached = createCachedRow(classicId, KnownCaip2ChainId.Mainnet);
    const { service, assetsService, getByAssetIds } = createService({
      repo: {
        getByAssetIds: jest.fn().mockResolvedValue([cached]),
      },
    });
    jest.spyOn(assetsService, 'isMigrationEnabled').mockResolvedValue(true);
    const getAssetMetadata = jest
      .spyOn(assetsService, 'getAssetMetadata')
      .mockResolvedValue(null);

    const result = await service.resolve(classicId);

    expect(result).toStrictEqual(cached);
    expect(getAssetMetadata).toHaveBeenCalledWith(classicId);
    expect(getByAssetIds).toHaveBeenCalledWith([classicId]);
    expect(mockGetAssetsByAssetIds).not.toHaveBeenCalled();
  });
});
