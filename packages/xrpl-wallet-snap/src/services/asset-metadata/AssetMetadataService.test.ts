import { buildUrl } from '@metamask/snap-networks-utils';
import type { MockedFunction } from 'vitest';

import type { KnownCaip19IouAssetId, KnownCaip19MptAssetId } from '../../api';
import { AssetType, KnownCaip2ChainId } from '../../api';
import { AppConfig } from '../../config';
import { IOU_DECIMAL_PLACES, XRPL_DECIMAL_PLACES } from '../../constants';
import { getSlip44AssetId, logger, parseMptIssuanceId } from '../../utils';
import type { AssetsService } from '../assets';
import type { NetworkService } from '../network/NetworkService';
import { RLUSD_IOU, USDC_IOU, USDC_MPT } from './__mocks__/assets.fixtures';
import type { IouXrplAssetMetadata, MptXrplAssetMetadata } from './api';
import type { AssetMetadataRepository } from './AssetMetadataRepository';
import { AssetMetadataService } from './AssetMetadataService';
import { AssetMetadataServiceException } from './exceptions';
import type { TokenMetadata } from './token-api/api';
import { TokenApiClient } from './token-api/TokenApiClient';
import { toXrplAssetMetadata } from './utils';

const scope = KnownCaip2ChainId.Mainnet;

function createCachedIou(assetId: KnownCaip19IouAssetId): IouXrplAssetMetadata {
  return {
    assetId,
    assetType: AssetType.Token,
    chainId: scope,
    name: 'Cached',
    symbol: 'CCH',
    fungible: true,
    iconUrl: 'https://example.test/icon.png',
    units: [{ name: 'Cached', symbol: 'CCH', decimals: IOU_DECIMAL_PLACES }],
  };
}

function createCachedMpt(assetId: KnownCaip19MptAssetId): MptXrplAssetMetadata {
  return {
    assetId,
    assetType: AssetType.Mpt,
    chainId: scope,
    name: 'Cached',
    symbol: 'CCH',
    fungible: true,
    iconUrl: 'https://example.test/icon.png',
    units: [{ name: 'Cached', symbol: 'CCH', decimals: 6 }],
  };
}

function createService(deps: { repo?: Partial<AssetMetadataRepository> } = {}) {
  const fetchAssetsByAssetIds = vi.fn().mockResolvedValue([]);
  const fetchAssetsByChainId = vi.fn().mockResolvedValue({
    data: [],
    count: 0,
    totalCount: 0,
  });

  const defaults = {
    getByAssetIds: vi.fn().mockResolvedValue([]),
    saveMany: vi.fn().mockResolvedValue(undefined),
    getByAssetType: vi.fn().mockResolvedValue([]),
    getAll: vi.fn().mockResolvedValue([]),
    getAllByScope: vi.fn().mockResolvedValue([]),
    getByAssetId: vi.fn().mockResolvedValue(null),
    isStale: vi.fn().mockResolvedValue(false),
  };

  const repo = {
    ...defaults,
    ...deps.repo,
  } as unknown as AssetMetadataRepository;

  vi.spyOn(
    TokenApiClient.prototype,
    'fetchAssetsByAssetIds',
  ).mockImplementation(fetchAssetsByAssetIds);
  vi.spyOn(TokenApiClient.prototype, 'fetchAssetsByChainId').mockImplementation(
    fetchAssetsByChainId,
  );

  const assetsService = {
    getAssetMetadata: vi.fn().mockResolvedValue(null),
  } as unknown as AssetsService;

  const service = new AssetMetadataService({
    assetMetadataRepository: repo,
    logger,
    assetsService,
    networkService: {} as unknown as NetworkService,
  });

  return {
    service,
    assetsService,
    fetchAssetsByAssetIds,
    fetchAssetsByChainId,
    getByAssetIds: repo.getByAssetIds as MockedFunction<
      AssetMetadataRepository['getByAssetIds']
    >,
    saveMany: repo.saveMany as MockedFunction<
      AssetMetadataRepository['saveMany']
    >,
  };
}

describe('AssetMetadataService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns native metadata for mainnet slip44 id', async () => {
    const { service, getByAssetIds, fetchAssetsByAssetIds } = createService({});
    const slipId = getSlip44AssetId(scope);
    const result = await service.resolve(slipId);

    expect(result.assetId).toStrictEqual(slipId);
    expect(result.assetType).toStrictEqual(AssetType.Native);
    expect(result.units[0]?.decimals).toStrictEqual(XRPL_DECIMAL_PLACES);
    expect(getByAssetIds).not.toHaveBeenCalled();
    expect(fetchAssetsByAssetIds).not.toHaveBeenCalled();
  });

  it('throws for an uncached IOU when the token API returns no row', async () => {
    const { service, saveMany, fetchAssetsByAssetIds } = createService({});

    await expect(service.resolve(USDC_IOU)).rejects.toThrow(
      AssetMetadataServiceException,
    );
    expect(fetchAssetsByAssetIds).toHaveBeenCalledWith([USDC_IOU]);
    expect(saveMany).not.toHaveBeenCalled();
  });

  it('returns a cached IOU without calling the token API', async () => {
    const cached = createCachedIou(USDC_IOU);
    const { service, getByAssetIds, saveMany, fetchAssetsByAssetIds } =
      createService({
        repo: {
          getByAssetIds: vi.fn().mockResolvedValue([cached]),
        },
      });

    const result = await service.resolve(USDC_IOU);

    expect(result).toStrictEqual(cached);
    expect(getByAssetIds).toHaveBeenCalledWith([USDC_IOU]);
    expect(fetchAssetsByAssetIds).not.toHaveBeenCalled();
    expect(saveMany).not.toHaveBeenCalled();
  });

  it('persists only the ids returned by the token API', async () => {
    const tokenRow: TokenMetadata = {
      assetId: USDC_MPT,
      decimals: 6,
      name: 'USDC',
      symbol: 'USDC',
    };
    const { service, saveMany, fetchAssetsByAssetIds } = createService({});
    fetchAssetsByAssetIds.mockResolvedValueOnce([tokenRow]);

    const result = await service.fetchAndPersistAssetsByAssetIds([
      USDC_MPT,
      USDC_IOU,
    ]);

    expect(fetchAssetsByAssetIds).toHaveBeenCalledWith([USDC_MPT, USDC_IOU]);
    expect(result).toStrictEqual([
      expect.objectContaining({
        assetId: USDC_MPT,
        assetType: AssetType.Mpt,
      }),
    ]);
    expect(saveMany).toHaveBeenCalledWith([
      expect.objectContaining({ assetId: USDC_MPT }),
    ]);
  });

  it('throws when the token API does not return metadata for a mainnet IOU', async () => {
    const { service, fetchAssetsByAssetIds } = createService({});

    await expect(service.resolve(USDC_IOU)).rejects.toThrow(
      AssetMetadataServiceException,
    );
    expect(fetchAssetsByAssetIds).toHaveBeenCalledWith([USDC_IOU]);
  });

  it('returns cached mainnet IOU without calling token API', async () => {
    const cached = createCachedIou(USDC_IOU);
    const {
      service,
      assetsService,
      getByAssetIds,
      saveMany,
      fetchAssetsByAssetIds,
    } = createService({
      repo: {
        getByAssetIds: vi.fn().mockResolvedValue([cached]),
      },
    });
    const getAssetMetadata = vi
      .spyOn(assetsService, 'getAssetMetadata')
      .mockResolvedValue(null);

    const result = await service.resolve(USDC_IOU);

    expect(result).toStrictEqual(cached);
    expect(getAssetMetadata).toHaveBeenCalledWith(USDC_IOU);
    expect(getByAssetIds).toHaveBeenCalledWith([USDC_IOU]);
    expect(fetchAssetsByAssetIds).not.toHaveBeenCalled();
    expect(saveMany).not.toHaveBeenCalled();
  });

  it('resolves requested MPT metadata and persists it', async () => {
    const tokenRow: TokenMetadata = {
      assetId: USDC_MPT,
      decimals: 6,
      name: 'USDC',
      symbol: 'USDC',
    };
    const { service, saveMany, fetchAssetsByAssetIds } = createService({});
    fetchAssetsByAssetIds.mockResolvedValueOnce([tokenRow]);

    const result = await service.fetchAndPersistAssetsByAssetIds([USDC_MPT]);

    expect(result).toStrictEqual([
      expect.objectContaining({
        assetId: USDC_MPT,
        name: 'USDC',
        symbol: 'USDC',
        assetType: AssetType.Mpt,
      }),
    ]);
    expect(fetchAssetsByAssetIds).toHaveBeenCalledWith([USDC_MPT]);
    expect(saveMany).toHaveBeenCalledWith([
      expect.objectContaining({
        assetId: USDC_MPT,
        symbol: 'USDC',
      }),
    ]);
  });

  it('resolves mainnet IOU from token API when API returns metadata', async () => {
    const tokenRow: TokenMetadata = {
      assetId: USDC_IOU,
      decimals: IOU_DECIMAL_PLACES,
      name: 'USD Coin',
      symbol: 'USDC',
    };
    const { service, saveMany, fetchAssetsByAssetIds } = createService({});
    fetchAssetsByAssetIds.mockResolvedValueOnce([tokenRow]);

    const result = await service.resolve(USDC_IOU);

    expect(result).toMatchObject({
      assetId: USDC_IOU,
      name: 'USD Coin',
      symbol: 'USDC',
      chainId: scope,
      assetType: AssetType.Token,
      fungible: true,
      units: [
        {
          name: 'USD Coin',
          symbol: 'USDC',
          decimals: IOU_DECIMAL_PLACES,
        },
      ],
      iconUrl: buildUrl({
        baseUrl: AppConfig.api.staticApi.baseUrl,
        path: '/api/v2/tokenIcons/assets/{assetId}.png',
        pathParams: {
          assetId: USDC_IOU.replace(/:/gu, '/'),
        },
        encodePathParams: false,
      }),
    });
    expect(saveMany).toHaveBeenCalledWith([
      expect.objectContaining({ assetId: USDC_IOU }),
    ]);
  });

  it('falls back IOU name and symbol to a decoded currency code when the API omits them', async () => {
    const tokenRow: TokenMetadata = {
      assetId: RLUSD_IOU,
      decimals: IOU_DECIMAL_PLACES,
    };
    const { service, fetchAssetsByAssetIds } = createService({});
    fetchAssetsByAssetIds.mockResolvedValueOnce([tokenRow]);

    const result = await service.resolve(RLUSD_IOU);

    expect(result).toMatchObject({
      name: 'RLUSD',
      symbol: 'RLUSD',
      units: [
        {
          name: 'RLUSD',
          symbol: 'RLUSD',
          decimals: IOU_DECIMAL_PLACES,
        },
      ],
    });
  });

  it('falls back MPT name and symbol to the issuance id when the API omits them', async () => {
    const tokenRow: TokenMetadata = {
      assetId: USDC_MPT,
      decimals: 0,
    };
    const { service, fetchAssetsByAssetIds, fetchAssetsByChainId } =
      createService({});
    fetchAssetsByAssetIds.mockResolvedValueOnce([tokenRow]);

    const result = await service.resolve(USDC_MPT);

    expect(result).toMatchObject({
      name: parseMptIssuanceId(USDC_MPT),
      symbol: parseMptIssuanceId(USDC_MPT),
    });
  });

  it('uses token API iconUrl when provided', async () => {
    const iconUrl = 'https://cdn.example/token.png';
    const tokenRow: TokenMetadata = {
      assetId: USDC_IOU,
      decimals: IOU_DECIMAL_PLACES,
      name: 'USD Coin',
      symbol: 'USDC',
      iconUrl,
    };
    const { service, fetchAssetsByAssetIds, fetchAssetsByChainId } =
      createService({});
    fetchAssetsByAssetIds.mockResolvedValueOnce([tokenRow]);

    const result = await service.resolve(USDC_IOU);

    expect(result.iconUrl).toStrictEqual(iconUrl);
  });

  it('persists mapped non-MPT assets from token API during synchronize', async () => {
    const iouTokenRow: TokenMetadata = {
      assetId: USDC_IOU,
      decimals: IOU_DECIMAL_PLACES,
      name: 'USD Coin',
      symbol: 'USDC',
    };
    const mptTokenRow: TokenMetadata = {
      assetId: USDC_MPT,
      decimals: 6,
      name: 'USDC',
      symbol: 'USDC',
    };
    const { service, saveMany, fetchAssetsByChainId } = createService({});
    fetchAssetsByChainId.mockResolvedValueOnce({
      data: [iouTokenRow, mptTokenRow],
      count: 2,
      totalCount: 2,
    });

    await service.synchronize(scope);

    expect(fetchAssetsByChainId).toHaveBeenCalledWith(scope);
    expect(saveMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          assetId: USDC_IOU,
          name: 'USD Coin',
          symbol: 'USDC',
          assetType: AssetType.Token,
          chainId: scope,
        }),
      ],
      true,
    );
  });

  describe('synchronizeIfStale', () => {
    it('synchronizes when the catalog is stale', async () => {
      const isStale = vi.fn().mockResolvedValue(true);
      const { service, saveMany, fetchAssetsByChainId } = createService({
        repo: { isStale },
      });
      fetchAssetsByChainId.mockResolvedValueOnce({
        data: [
          {
            assetId: USDC_IOU,
            decimals: IOU_DECIMAL_PLACES,
            name: 'USD Coin',
            symbol: 'USDC',
          },
        ],
        count: 1,
        totalCount: 1,
      });

      await service.synchronizeIfStale(scope);

      expect(isStale).toHaveBeenCalledWith(
        AppConfig.cache.ttlMilliseconds.assetMetadata,
      );
      expect(fetchAssetsByChainId).toHaveBeenCalledWith(scope);
      expect(saveMany).toHaveBeenCalledWith(
        [expect.objectContaining({ assetId: USDC_IOU })],
        true,
      );
    });

    it('skips synchronize when the catalog is fresh', async () => {
      const isStale = vi.fn().mockResolvedValue(false);
      const { service, saveMany, fetchAssetsByChainId } = createService({
        repo: { isStale },
      });

      await service.synchronizeIfStale(scope);

      expect(isStale).toHaveBeenCalledWith(
        AppConfig.cache.ttlMilliseconds.assetMetadata,
      );
      expect(fetchAssetsByChainId).not.toHaveBeenCalled();
      expect(saveMany).not.toHaveBeenCalled();
    });
  });

  describe('getAssetsByScopeAndType', () => {
    it('delegates to the repository for the scope and asset type', async () => {
      const mptRows: MptXrplAssetMetadata[] = [createCachedMpt(USDC_MPT)];
      const getByAssetType = vi.fn().mockResolvedValue(mptRows);
      const { service } = createService({
        repo: { getByAssetType },
      });

      const result = await service.getAssetsByScopeAndType(
        scope,
        AssetType.Mpt,
      );

      expect(result).toStrictEqual(mptRows);
      expect(getByAssetType).toHaveBeenCalledWith(AssetType.Mpt, scope);
    });
  });

  describe('fetchAndPersistMptAssetMetadata', () => {
    const freshCatalogRow = (): MptXrplAssetMetadata => ({
      ...createCachedMpt(USDC_MPT),
      persistedAt: Date.now(),
    });

    it('returns fetched MPT rows and skips other asset types', async () => {
      const mptRow = freshCatalogRow();
      const { service, fetchAssetsByChainId } = createService({});
      const fetchByIds = vi
        .spyOn(service, 'fetchAndPersistAssetsByAssetIds')
        .mockResolvedValue([createCachedIou(USDC_IOU), mptRow]);

      const result = await service.fetchAndPersistMptAssetMetadata({
        scope,
        assetIds: [USDC_MPT],
      });

      expect(fetchByIds).toHaveBeenCalledWith([USDC_MPT]);
      expect(result).toStrictEqual([mptRow]);
    });

    it('returns the persisted catalog without syncing when ids are omitted', async () => {
      const catalog = [freshCatalogRow()];
      const isStale = vi.fn().mockResolvedValue(true);
      const getByAssetType = vi.fn().mockResolvedValue(catalog);
      const { service, saveMany, fetchAssetsByChainId } = createService({
        repo: { isStale, getByAssetType },
      });

      const result = await service.fetchAndPersistMptAssetMetadata({
        scope,
      });

      expect(getByAssetType).toHaveBeenCalledWith(AssetType.Mpt, scope);
      expect(isStale).not.toHaveBeenCalled();
      expect(fetchAssetsByChainId).not.toHaveBeenCalled();
      expect(saveMany).not.toHaveBeenCalled();
      expect(result).toStrictEqual(catalog);
    });

    it('returns the persisted catalog when asset ids are empty', async () => {
      const catalog = [freshCatalogRow()];
      const getByAssetType = vi.fn().mockResolvedValue(catalog);
      const { service } = createService({
        repo: { getByAssetType },
      });

      const result = await service.fetchAndPersistMptAssetMetadata({
        scope,
        assetIds: [],
      });

      expect(result).toStrictEqual(catalog);
      expect(getByAssetType).toHaveBeenCalledWith(AssetType.Mpt, scope);
    });
  });

  it('maps AssetsController catalog metadata into XrplAssetMetadata without reading snap state', async () => {
    const {
      service,
      assetsService,
      getByAssetIds,
      saveMany,
      fetchAssetsByAssetIds,
    } = createService({});
    const getAssetMetadata = vi
      .spyOn(assetsService, 'getAssetMetadata')
      .mockResolvedValue({
        symbol: 'USDC',
        decimals: IOU_DECIMAL_PLACES,
        name: 'USD Coin',
      });

    const result = await service.resolve(USDC_IOU);

    expect(result).toStrictEqual(
      toXrplAssetMetadata({
        assetId: USDC_IOU,
        decimals: IOU_DECIMAL_PLACES,
        symbol: 'USDC',
        name: 'USD Coin',
      }),
    );
    expect(getAssetMetadata).toHaveBeenCalledWith(USDC_IOU);
    expect(getByAssetIds).not.toHaveBeenCalled();
    expect(fetchAssetsByAssetIds).not.toHaveBeenCalled();
    expect(saveMany).not.toHaveBeenCalled();
  });

  it('falls back to snap catalog when AssetsController misses', async () => {
    const cached = createCachedIou(USDC_IOU);
    const { service, assetsService, getByAssetIds, fetchAssetsByAssetIds } =
      createService({
        repo: {
          getByAssetIds: vi.fn().mockResolvedValue([cached]),
        },
      });
    const getAssetMetadata = vi
      .spyOn(assetsService, 'getAssetMetadata')
      .mockResolvedValue(null);

    const result = await service.resolve(USDC_IOU);

    expect(result).toStrictEqual(cached);
    expect(getAssetMetadata).toHaveBeenCalledWith(USDC_IOU);
    expect(getByAssetIds).toHaveBeenCalledWith([USDC_IOU]);
    expect(fetchAssetsByAssetIds).not.toHaveBeenCalled();
  });

  it('throws when AssetsController, snap, and token API all miss', async () => {
    const {
      service,
      assetsService,
      getByAssetIds,
      saveMany,
      fetchAssetsByAssetIds,
    } = createService({});

    await expect(service.resolve(USDC_MPT)).rejects.toBeInstanceOf(
      AssetMetadataServiceException,
    );
    expect(assetsService.getAssetMetadata).toHaveBeenCalledWith(USDC_MPT);
    expect(getByAssetIds).toHaveBeenCalledWith([USDC_MPT]);
    expect(fetchAssetsByAssetIds).toHaveBeenCalledWith([USDC_MPT]);
    expect(saveMany).not.toHaveBeenCalled();
  });
});
