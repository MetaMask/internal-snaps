import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
} from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import type { RemoteFeatureFlagsProvider } from '@metamask/snap-networks-utils';
import type { CaipAssetType } from '@metamask/utils';

import { KnownCaip19Id, Network } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import type { CoreAssetsAdapter } from './adapters/CoreAssetsAdapter';
import { SnapAssetsAdapter } from './adapters/SnapAssetsAdapter';
import { AssetsService } from './AssetsService';

const TRON_FLAG_KEY = SNAPS_ASSETS_MIGRATION_FLAG_KEYS.tron;

const mockAccount: KeyringAccount = {
  id: 'test-account-id',
  address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
  type: 'eip155:eoa',
  options: {},
  methods: [],
  scopes: [Network.Mainnet],
};

const mockAsset: AssetEntity = {
  assetType: KnownCaip19Id.TrxMainnet,
  keyringAccountId: mockAccount.id,
  network: Network.Mainnet,
  symbol: 'TRX',
  decimals: 6,
  rawAmount: '1',
  uiAmount: '1',
  iconUrl: '',
};

/**
 * Builds an AssetsService that delegates to mock adapters.
 *
 * @param migrationOn - Whether the Tron assets migration flag should be active.
 * @returns The service and the mocks it was constructed with.
 */
function createAssetsService(migrationOn: boolean): {
  assetsService: AssetsService;
  snapAdapter: {
    cacheTtlsMilliseconds: SnapAssetsAdapter['cacheTtlsMilliseconds'];
    getAccountAssetsByIDs: jest.Mock;
    getAccountAssetByID: jest.Mock;
    fetchAssetsAndBalancesForAccount: jest.Mock;
    getAssetsMetadata: jest.Mock;
    saveMany: jest.Mock;
    getAll: jest.Mock;
    getAccountAssets: jest.Mock;
    getMultipleTokenConversions: jest.Mock;
    getMultipleTokensMarketData: jest.Mock;
    getHistoricalPrice: jest.Mock;
  };
  coreAdapter: {
    getAccountAssetsByIDs: jest.Mock;
    getAccountAssetByID: jest.Mock;
    fetchAssetsAndBalancesForAccount: jest.Mock;
    saveMany: jest.Mock;
    getAccountAssets: jest.Mock;
  };
  remoteFeatureFlagsProvider: {
    getFeatureFlag: jest.Mock;
  };
} {
  const snapAdapter = {
    cacheTtlsMilliseconds: {
      fiatExchangeRates: 1,
      spotPrices: 2,
      historicalPrices: 3,
    },
    getAccountAssetsByIDs: jest.fn().mockResolvedValue([]),
    getAccountAssetByID: jest.fn().mockResolvedValue(null),
    fetchAssetsAndBalancesForAccount: jest.fn().mockResolvedValue([]),
    getAssetsMetadata: jest.fn().mockResolvedValue({}),
    saveMany: jest.fn().mockResolvedValue(undefined),
    getAll: jest.fn().mockResolvedValue([]),
    getAccountAssets: jest.fn().mockResolvedValue([]),
    getMultipleTokenConversions: jest.fn().mockResolvedValue({}),
    getMultipleTokensMarketData: jest.fn().mockResolvedValue({}),
    getHistoricalPrice: jest.fn().mockResolvedValue({
      intervals: {},
      updateTime: 0,
    }),
  };

  const coreAdapter = {
    getAccountAssetsByIDs: jest.fn().mockResolvedValue([]),
    getAccountAssetByID: jest.fn().mockResolvedValue(null),
    fetchAssetsAndBalancesForAccount: jest.fn().mockResolvedValue([]),
    saveMany: jest.fn().mockResolvedValue(undefined),
    getAccountAssets: jest.fn().mockResolvedValue([]),
  };

  const remoteFeatureFlagsProvider = {
    getFeatureFlag: jest.fn().mockResolvedValue({
      stage: migrationOn
        ? SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback
        : SnapsAssetsMigrationStage.Off,
    }),
  };

  const assetsService = new AssetsService({
    snapAdapter: snapAdapter as unknown as SnapAssetsAdapter,
    coreAdapter: coreAdapter as unknown as CoreAssetsAdapter,
    remoteFeatureFlagsProvider:
      remoteFeatureFlagsProvider as unknown as RemoteFeatureFlagsProvider,
  });

  return {
    assetsService,
    snapAdapter,
    coreAdapter,
    remoteFeatureFlagsProvider,
  };
}

describe('AssetsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes cache TTLs from the Snap adapter', () => {
    const { assetsService, snapAdapter } = createAssetsService(false);

    expect(assetsService.cacheTtlsMilliseconds).toBe(
      snapAdapter.cacheTtlsMilliseconds,
    );
  });

  describe('static helpers', () => {
    it('delegates isFiat to SnapAssetsAdapter', () => {
      const isFiat = jest.spyOn(SnapAssetsAdapter, 'isFiat');
      const assetId = 'swift:0/iso4217:usd' as CaipAssetType;

      expect(AssetsService.isFiat(assetId)).toBe(true);
      expect(isFiat).toHaveBeenCalledWith(assetId);
    });

    it('delegates hasChanged to SnapAssetsAdapter', () => {
      const hasChanged = jest.spyOn(SnapAssetsAdapter, 'hasChanged');

      expect(AssetsService.hasChanged(mockAsset, [])).toBe(true);
      expect(hasChanged).toHaveBeenCalledWith(mockAsset, []);
    });
  });

  describe('getAccountAssetsByIDs', () => {
    it('returns an empty list without consulting adapters when no IDs are given', async () => {
      const { assetsService, snapAdapter, coreAdapter } =
        createAssetsService(true);

      await expect(
        assetsService.getAccountAssetsByIDs(mockAccount.id, []),
      ).resolves.toStrictEqual([]);
      expect(snapAdapter.getAccountAssetsByIDs).not.toHaveBeenCalled();
      expect(coreAdapter.getAccountAssetsByIDs).not.toHaveBeenCalled();
    });

    it('delegates to the Snap adapter when migration is off', async () => {
      const { assetsService, snapAdapter, coreAdapter } =
        createAssetsService(false);
      snapAdapter.getAccountAssetsByIDs.mockResolvedValue([mockAsset]);

      await expect(
        assetsService.getAccountAssetsByIDs(mockAccount.id, [
          KnownCaip19Id.TrxMainnet,
        ]),
      ).resolves.toStrictEqual([mockAsset]);
      expect(snapAdapter.getAccountAssetsByIDs).toHaveBeenCalledWith(
        mockAccount.id,
        [KnownCaip19Id.TrxMainnet],
      );
      expect(coreAdapter.getAccountAssetsByIDs).not.toHaveBeenCalled();
    });

    it('delegates to the Core adapter when migration is on', async () => {
      const {
        assetsService,
        snapAdapter,
        coreAdapter,
        remoteFeatureFlagsProvider,
      } = createAssetsService(true);
      coreAdapter.getAccountAssetsByIDs.mockResolvedValue([mockAsset]);

      await expect(
        assetsService.getAccountAssetsByIDs(mockAccount.id, [
          KnownCaip19Id.TrxMainnet,
        ]),
      ).resolves.toStrictEqual([mockAsset]);
      expect(remoteFeatureFlagsProvider.getFeatureFlag).toHaveBeenCalledWith(
        TRON_FLAG_KEY,
      );
      expect(coreAdapter.getAccountAssetsByIDs).toHaveBeenCalledWith(
        mockAccount.id,
        [KnownCaip19Id.TrxMainnet],
      );
      expect(snapAdapter.getAccountAssetsByIDs).not.toHaveBeenCalled();
    });
  });

  describe('getAccountAssetByID', () => {
    it('delegates to the Snap adapter when migration is off', async () => {
      const { assetsService, snapAdapter, coreAdapter } =
        createAssetsService(false);
      snapAdapter.getAccountAssetByID.mockResolvedValue(mockAsset);

      await expect(
        assetsService.getAccountAssetByID(
          mockAccount.id,
          KnownCaip19Id.TrxMainnet,
        ),
      ).resolves.toBe(mockAsset);
      expect(snapAdapter.getAccountAssetByID).toHaveBeenCalledWith(
        mockAccount.id,
        KnownCaip19Id.TrxMainnet,
      );
      expect(coreAdapter.getAccountAssetByID).not.toHaveBeenCalled();
    });

    it('delegates to the Core adapter when migration is on', async () => {
      const { assetsService, snapAdapter, coreAdapter } =
        createAssetsService(true);
      coreAdapter.getAccountAssetByID.mockResolvedValue(mockAsset);

      await expect(
        assetsService.getAccountAssetByID(
          mockAccount.id,
          KnownCaip19Id.TrxMainnet,
        ),
      ).resolves.toBe(mockAsset);
      expect(coreAdapter.getAccountAssetByID).toHaveBeenCalledWith(
        mockAccount.id,
        KnownCaip19Id.TrxMainnet,
      );
      expect(snapAdapter.getAccountAssetByID).not.toHaveBeenCalled();
    });
  });

  describe('fetchAssetsAndBalancesForAccount', () => {
    it('delegates to the Snap adapter when migration is off', async () => {
      const { assetsService, snapAdapter, coreAdapter } =
        createAssetsService(false);
      snapAdapter.fetchAssetsAndBalancesForAccount.mockResolvedValue([
        mockAsset,
      ]);

      await expect(
        assetsService.fetchAssetsAndBalancesForAccount(
          Network.Mainnet,
          mockAccount,
        ),
      ).resolves.toStrictEqual([mockAsset]);
      expect(snapAdapter.fetchAssetsAndBalancesForAccount).toHaveBeenCalledWith(
        Network.Mainnet,
        mockAccount,
      );
      expect(
        coreAdapter.fetchAssetsAndBalancesForAccount,
      ).not.toHaveBeenCalled();
    });

    it('delegates to the Core adapter when migration is on', async () => {
      const { assetsService, snapAdapter, coreAdapter } =
        createAssetsService(true);
      coreAdapter.fetchAssetsAndBalancesForAccount.mockResolvedValue([
        mockAsset,
      ]);

      await expect(
        assetsService.fetchAssetsAndBalancesForAccount(
          Network.Mainnet,
          mockAccount,
        ),
      ).resolves.toStrictEqual([mockAsset]);
      expect(coreAdapter.fetchAssetsAndBalancesForAccount).toHaveBeenCalledWith(
        Network.Mainnet,
        mockAccount,
      );
      expect(
        snapAdapter.fetchAssetsAndBalancesForAccount,
      ).not.toHaveBeenCalled();
    });
  });

  describe('saveMany', () => {
    it('delegates to the Snap adapter when migration is off', async () => {
      const { assetsService, snapAdapter, coreAdapter } =
        createAssetsService(false);

      await assetsService.saveMany([mockAsset]);

      expect(snapAdapter.saveMany).toHaveBeenCalledWith([mockAsset]);
      expect(coreAdapter.saveMany).not.toHaveBeenCalled();
    });

    it('delegates to the Core adapter when migration is on', async () => {
      const { assetsService, snapAdapter, coreAdapter } =
        createAssetsService(true);

      await assetsService.saveMany([mockAsset]);

      expect(coreAdapter.saveMany).toHaveBeenCalledWith([mockAsset]);
      expect(snapAdapter.saveMany).not.toHaveBeenCalled();
    });
  });

  describe('getAccountAssets', () => {
    it('delegates to the Snap adapter when migration is off', async () => {
      const { assetsService, snapAdapter, coreAdapter } =
        createAssetsService(false);
      snapAdapter.getAccountAssets.mockResolvedValue([mockAsset]);

      await expect(
        assetsService.getAccountAssets(mockAccount.id),
      ).resolves.toStrictEqual([mockAsset]);
      expect(snapAdapter.getAccountAssets).toHaveBeenCalledWith(mockAccount.id);
      expect(coreAdapter.getAccountAssets).not.toHaveBeenCalled();
    });

    it('delegates to the Core adapter when migration is on', async () => {
      const { assetsService, snapAdapter, coreAdapter } =
        createAssetsService(true);
      coreAdapter.getAccountAssets.mockResolvedValue([mockAsset]);

      await expect(
        assetsService.getAccountAssets(mockAccount.id),
      ).resolves.toStrictEqual([mockAsset]);
      expect(coreAdapter.getAccountAssets).toHaveBeenCalledWith(mockAccount.id);
      expect(snapAdapter.getAccountAssets).not.toHaveBeenCalled();
    });
  });

  describe('methods that always use the Snap adapter', () => {
    it('delegates getAssetsMetadata to the Snap adapter while migration is on', async () => {
      const { assetsService, snapAdapter } = createAssetsService(true);
      const metadata = { [KnownCaip19Id.TrxMainnet]: null };
      snapAdapter.getAssetsMetadata.mockResolvedValue(metadata);

      await expect(
        assetsService.getAssetsMetadata([KnownCaip19Id.TrxMainnet]),
      ).resolves.toBe(metadata);
      expect(snapAdapter.getAssetsMetadata).toHaveBeenCalledWith([
        KnownCaip19Id.TrxMainnet,
      ]);
    });

    it('delegates getAll to the Snap adapter while migration is on', async () => {
      const { assetsService, snapAdapter } = createAssetsService(true);
      snapAdapter.getAll.mockResolvedValue([mockAsset]);

      await expect(assetsService.getAll()).resolves.toStrictEqual([mockAsset]);
      expect(snapAdapter.getAll).toHaveBeenCalledWith();
    });

    it('delegates getMultipleTokenConversions to the Snap adapter while migration is on', async () => {
      const { assetsService, snapAdapter } = createAssetsService(true);
      const conversions = [
        {
          from: KnownCaip19Id.TrxMainnet,
          to: 'swift:0/iso4217:usd' as CaipAssetType,
        },
      ];
      const result = { [KnownCaip19Id.TrxMainnet]: {} };
      snapAdapter.getMultipleTokenConversions.mockResolvedValue(result);

      await expect(
        assetsService.getMultipleTokenConversions(conversions),
      ).resolves.toBe(result);
      expect(snapAdapter.getMultipleTokenConversions).toHaveBeenCalledWith(
        conversions,
      );
    });

    it('delegates getMultipleTokensMarketData to the Snap adapter while migration is on', async () => {
      const { assetsService, snapAdapter } = createAssetsService(true);
      const assets = [
        {
          asset: KnownCaip19Id.TrxMainnet,
          unit: 'swift:0/iso4217:usd' as CaipAssetType,
        },
      ];
      const result = { [KnownCaip19Id.TrxMainnet]: {} };
      snapAdapter.getMultipleTokensMarketData.mockResolvedValue(result);

      await expect(
        assetsService.getMultipleTokensMarketData(assets),
      ).resolves.toBe(result);
      expect(snapAdapter.getMultipleTokensMarketData).toHaveBeenCalledWith(
        assets,
      );
    });

    it('delegates getHistoricalPrice to the Snap adapter while migration is on', async () => {
      const { assetsService, snapAdapter } = createAssetsService(true);
      const result = { intervals: {}, updateTime: 1 };
      snapAdapter.getHistoricalPrice.mockResolvedValue(result);

      await expect(
        assetsService.getHistoricalPrice(
          KnownCaip19Id.TrxMainnet,
          'swift:0/iso4217:usd',
        ),
      ).resolves.toBe(result);
      expect(snapAdapter.getHistoricalPrice).toHaveBeenCalledWith(
        KnownCaip19Id.TrxMainnet,
        'swift:0/iso4217:usd',
      );
    });
  });
});
