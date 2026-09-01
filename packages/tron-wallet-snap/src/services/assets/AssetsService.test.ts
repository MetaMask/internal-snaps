import type { Asset, Caip19AssetId } from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import { KeyringEvent } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';

import type { PriceApiClient } from '../../clients/price-api/PriceApiClient';
import type { SpotPrices } from '../../clients/price-api/types';
import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TokenApiClient } from '../../clients/token-api/TokenApiClient';
import type { AccountResources, TronHttpClient } from '../../clients/tron-http';
import { TrongridAccountNotFoundError } from '../../clients/trongrid/errors';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import type { TronAccount } from '../../clients/trongrid/types';
import { KnownCaip19Id, Network, SNAP_OWNED_ASSETS } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import type { CoreMessengerCaller } from '../../types/core-messenger';
import { mockLogger } from '../../utils/mockLogger';
import type { AssetsRepository } from './AssetsRepository';
import type { TokenCaipAssetType } from './types';

jest.mock('../../context', () => ({
  configProvider: {
    get() {
      return {
        priceApi: {
          cacheTtlsMilliseconds: {
            fiatExchangeRates: 3600000,
            spotPrices: 3600000,
            historicalPrices: 3600000,
          },
        },
        activeNetworks: [],
      };
    },
  },
}));

jest.mock('@metamask/keyring-snap-sdk', () => ({
  emitSnapKeyringEvent: jest.fn(),
}));

(global as any).snap = {};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AssetsService } = require('./AssetsService');

function createMessengerCallMock(
  getAccountAssetByID: jest.Mock,
  getAccountAssetsByIDs: jest.Mock = jest.fn().mockResolvedValue({}),
  getAccountAssetsByScope: jest.Mock = jest.fn().mockResolvedValue({}),
): CoreMessengerCaller['call'] {
  return async (actionType, ...args) => {
    switch (actionType) {
      case 'AssetsController:getAccountAssetByID':
        return getAccountAssetByID(...args);
      case 'AssetsController:getAccountAssetsByIDs':
        return getAccountAssetsByIDs(...args);
      case 'AssetsController:getAccountAssetsByScope':
        return getAccountAssetsByScope(...args);
      default:
        return undefined;
    }
  };
}

function buildControllerAsset(
  assetId: string,
  amount: string,
  metadata: {
    symbol: string;
    name: string;
    decimals: number;
    image?: string;
  },
): Asset {
  return {
    id: assetId as Asset['id'],
    chainId: Network.Mainnet as Asset['chainId'],
    balance: { amount },
    metadata: {
      type: 'fungible',
      symbol: metadata.symbol,
      name: metadata.name,
      decimals: metadata.decimals,
      image: metadata.image,
    },
    price: { price: 0, lastUpdated: 0 },
    fiatValue: 0,
  } as Asset;
}

const mockAccount: KeyringAccount = {
  id: 'test-account-id',
  address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
  type: 'eip155:eoa',
  options: {},
  methods: [],
  scopes: ['tron:728126428'],
};

const emptyAccountResources: AccountResources = {
  freeNetUsed: 0,
  freeNetLimit: 0,
  NetLimit: 0,
  TotalNetLimit: 0,
  TotalNetWeight: 0,
  tronPowerUsed: 0,
  tronPowerLimit: 0,
  TotalEnergyLimit: 0,
  TotalEnergyWeight: 0,
};

/**
 * Creates properly typed SpotPrices for tests.
 *
 * @param entries - Map of asset ID to price info.
 * @returns SpotPrices object.
 */
const createSpotPrices = (
  entries: Record<string, { id: string; price: number }>,
): SpotPrices =>
  Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [
      key,
      { id: value.id, price: value.price },
    ]),
  );

/**
 * Creates a properly typed TronAccount for tests.
 * Uses snake_case property names to match Tron API response format.
 *
 * @param overrides - Partial TronAccount with required address.
 * @returns A complete TronAccount.
 */

const createMockTronAccount = (
  overrides: Partial<TronAccount> & { address: string },
): TronAccount => ({
  owner_permission: { keys: [], threshold: 1, permission_name: 'owner' },
  account_resource: {
    energy_window_optimized: false,
    energy_window_size: 0,
  },
  active_permission: [],
  create_time: 0,
  latest_opration_time: 0,
  frozenV2: [],
  unfrozenV2: [],
  balance: 0,
  trc20: [],
  latest_consume_free_time: 0,
  votes: [],
  latest_withdraw_time: 0,
  net_window_size: 0,
  net_window_optimized: false,
  ...overrides,
});

// Convenience alias used by bandwidth/energy tests
const minimalTronAccount = createMockTronAccount({
  address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
});

/**
 * Builds a mock AccountResources object matching the shape returned by
 * POST https://api.trongrid.io/wallet/getaccountresource.
 *
 * The Tron full node omits fields with zero values, so all
 * account-level fields are optional. Network-level totals use
 * sensible mainnet defaults.
 *
 * @see https://developers.tron.network/reference/getaccountresource
 * @param overrides - Account-specific fields to set.
 * @returns A mock AccountResources object.
 */
function getMockAccountResources(overrides: Record<string, number> = {}) {
  return {
    freeNetLimit: 600,
    TotalNetLimit: 0,
    TotalNetWeight: 0,
    TotalEnergyLimit: 0,
    TotalEnergyWeight: 0,
    ...overrides,
  };
}

/**
 * Finds an asset by its CAIP-19 asset type.
 *
 * @param assets - The list of assets to search.
 * @param assetType - The CAIP-19 asset type to match.
 * @returns The matching asset, or undefined.
 */
function findAsset(assets: AssetEntity[], assetType: KnownCaip19Id) {
  return assets.find((a: AssetEntity) => a.assetType === assetType);
}

type WithAssetsServiceCallback<ReturnValue> = (payload: {
  assetsService: InstanceType<typeof AssetsService>;
  mockAssetsRepository: jest.Mocked<
    Pick<
      AssetsRepository,
      | 'saveMany'
      | 'getAll'
      | 'getByAccountId'
      | 'getByAccountIdAndAssetType'
      | 'getByAccountIdAndAssetTypes'
    >
  >;
  mockTrongridApiClient: jest.Mocked<
    Pick<
      TrongridApiClient,
      'getAccountInfoByAddress' | 'getTrc20BalancesByAddress'
    >
  >;
  mockTronHttpClient: jest.Mocked<
    Pick<TronHttpClient, 'getAccountResources' | 'getReward'>
  >;
  mockPriceApiClient: jest.Mocked<
    Pick<
      PriceApiClient,
      'getFiatExchangeRates' | 'getHistoricalPrices' | 'getMultipleSpotPrices'
    >
  >;
  mockTokenApiClient: jest.Mocked<Pick<TokenApiClient, 'getTokensMetadata'>>;
  mockSnapClient: jest.Mocked<Pick<SnapClient, 'trackError'>>;
  mockCoreMessenger: jest.Mocked<CoreMessengerCaller>;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * Wraps tests for AssetsService by creating a fresh service with all mock
 * dependencies. The callback receives the service and all mocks for
 * test configuration.
 *
 * @param testFunction - The test body receiving the service and mocks.
 * @returns The return value of the callback.
 */
async function withAssetsService<ReturnValue>(
  testFunction: WithAssetsServiceCallback<ReturnValue>,
): Promise<ReturnValue> {
  const mockAssetsRepository: jest.Mocked<
    Pick<
      AssetsRepository,
      | 'getAll'
      | 'getByAccountId'
      | 'getByAccountIdAndAssetType'
      | 'getByAccountIdAndAssetTypes'
      | 'saveMany'
    >
  > = {
    saveMany: jest.fn().mockResolvedValue(undefined),
    getAll: jest.fn().mockResolvedValue([]),
    getByAccountId: jest.fn().mockResolvedValue([]),
    getByAccountIdAndAssetType: jest.fn().mockResolvedValue(null),
    getByAccountIdAndAssetTypes: jest.fn().mockResolvedValue([]),
  };

  const mockTrongridApiClient: jest.Mocked<
    Pick<
      TrongridApiClient,
      'getAccountInfoByAddress' | 'getTrc20BalancesByAddress'
    >
  > = {
    getAccountInfoByAddress: jest.fn(),
    getTrc20BalancesByAddress: jest.fn(),
  };

  const mockTronHttpClient: jest.Mocked<
    Pick<TronHttpClient, 'getAccountResources' | 'getReward'>
  > = {
    getAccountResources: jest.fn(),
    getReward: jest.fn().mockResolvedValue(0),
  };

  const mockPriceApiClient: jest.Mocked<
    Pick<
      PriceApiClient,
      'getFiatExchangeRates' | 'getHistoricalPrices' | 'getMultipleSpotPrices'
    >
  > = {
    getFiatExchangeRates: jest.fn(),
    getHistoricalPrices: jest.fn(),
    getMultipleSpotPrices: jest.fn().mockResolvedValue({}),
  };

  const mockTokenApiClient: jest.Mocked<
    Pick<TokenApiClient, 'getTokensMetadata'>
  > = {
    getTokensMetadata: jest.fn().mockResolvedValue({}),
  };

  const mockSnapClient: jest.Mocked<Pick<SnapClient, 'trackError'>> = {
    trackError: jest.fn().mockResolvedValue(undefined),
  };

  const mockGetAccountAssetByID = jest.fn();
  const mockGetAccountAssetsByIDs = jest.fn().mockResolvedValue({});
  const mockGetAccountAssetsByScope = jest.fn().mockResolvedValue({});
  const mockCoreMessenger: jest.Mocked<CoreMessengerCaller> = {
    call: jest
      .fn()
      .mockImplementation(
        createMessengerCallMock(
          mockGetAccountAssetByID,
          mockGetAccountAssetsByIDs,
          mockGetAccountAssetsByScope,
        ),
      ),
  };

  const assetsProvider = {
    getAccountAssetByID: (
      accountId: string,
      assetId: Caip19AssetId,
    ): Promise<Asset | null> =>
      mockCoreMessenger.call(
        'AssetsController:getAccountAssetByID',
        accountId,
        assetId,
      ) as Promise<Asset | null>,
    getAccountAssetsByIDs: (
      accountId: string,
      assetIds: Caip19AssetId[],
    ): Promise<Record<Caip19AssetId, Asset | null>> =>
      mockCoreMessenger.call(
        'AssetsController:getAccountAssetsByIDs',
        accountId,
        assetIds,
      ) as Promise<Record<Caip19AssetId, Asset | null>>,
    getAccountAssetsByScope: (
      scope: string,
      accountId: string,
    ): Promise<Record<Caip19AssetId, Asset>> =>
      mockCoreMessenger.call(
        'AssetsController:getAccountAssetsByScope',
        scope,
        accountId,
      ) as Promise<Record<Caip19AssetId, Asset>>,
  };

  const assetsService = new AssetsService({
    logger: mockLogger,
    assetsRepository: mockAssetsRepository,
    trongridApiClient: mockTrongridApiClient,
    tronHttpClient: mockTronHttpClient,
    priceApiClient: mockPriceApiClient,
    tokenApiClient: mockTokenApiClient,
    snapClient: mockSnapClient,
    assetsProvider,
  });

  return await testFunction({
    assetsService,
    mockAssetsRepository,
    mockTrongridApiClient,
    mockTronHttpClient,
    mockPriceApiClient,
    mockTokenApiClient,
    mockSnapClient,
    mockCoreMessenger,
  });
}

/**
 * Runs syncSnapOwnedAssets and returns the assets passed to repository saveMany.
 *
 * @param assetsService - The assets service under test.
 * @param mockAssetsRepository - The mocked assets repository.
 * @returns The snap-owned assets persisted by the sync.
 */
async function syncAndGetSavedAssets(
  assetsService: InstanceType<typeof AssetsService>,
  mockAssetsRepository: jest.Mocked<Pick<AssetsRepository, 'saveMany'>>,
): Promise<AssetEntity[]> {
  await assetsService.syncSnapOwnedAssets([mockAccount], [Network.Mainnet]);
  expect(mockAssetsRepository.saveMany).toHaveBeenCalled();
  return mockAssetsRepository.saveMany.mock.calls.at(-1)?.[0] as AssetEntity[];
}

describe('AssetsService', () => {
  describe('syncSnapOwnedAssets', () => {
    describe('inactive account fallback', () => {
      it('returns zero snap-owned resources when account info fails (inactive account)', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockRejectedValue(
              new TrongridAccountNotFoundError(),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              emptyAccountResources,
            );

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              mockTrongridApiClient.getTrc20BalancesByAddress,
            ).not.toHaveBeenCalled();

            const bandwidthAsset = findAsset(
              assets,
              KnownCaip19Id.BandwidthMainnet,
            );
            const energyAsset = findAsset(assets, KnownCaip19Id.EnergyMainnet);
            expect(bandwidthAsset).toBeDefined();
            expect(energyAsset).toBeDefined();
            expect(
              assets.some(
                (asset) => asset.assetType === KnownCaip19Id.TrxMainnet,
              ),
            ).toBe(false);
          },
        );
      });
    });

    describe('partial failure handling', () => {
      it('continues with zero resources when only resources request fails', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              createMockTronAccount({
                address: mockAccount.address,
                balance: 1000000,
                trc20: [],
              }),
            );
            mockTronHttpClient.getAccountResources.mockRejectedValue(
              new Error('Resources endpoint unavailable'),
            );

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              assets.some(
                (asset) => asset.assetType === KnownCaip19Id.TrxMainnet,
              ),
            ).toBe(false);

            const bandwidthAsset = findAsset(
              assets,
              KnownCaip19Id.BandwidthMainnet,
            );
            expect(bandwidthAsset).toBeDefined();
            expect(bandwidthAsset?.rawAmount).toBe('0');
          },
        );
      });
    });

    describe('bandwidth', () => {
      it('returns 0 when account has no resources', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              findAsset(assets, KnownCaip19Id.BandwidthMainnet)?.rawAmount,
            ).toBe('0');
          },
        );
      });

      it('returns remaining free bandwidth when no staking', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({ freeNetUsed: 200 }),
            );

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              findAsset(assets, KnownCaip19Id.BandwidthMainnet)?.rawAmount,
            ).toBe('400');
          },
        );
      });

      it('returns combined remaining free + staked bandwidth', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({ freeNetUsed: 326, NetLimit: 16 }),
            );

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              findAsset(assets, KnownCaip19Id.BandwidthMainnet)?.rawAmount,
            ).toBe('290');
          },
        );
      });

      it('clamps to 0 when used exceeds maximum', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({
                freeNetUsed: 600,
                NetUsed: 50,
                NetLimit: 16,
              }),
            );

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              findAsset(assets, KnownCaip19Id.BandwidthMainnet)?.rawAmount,
            ).toBe('0');
          },
        );
      });
    });

    describe('maximum bandwidth', () => {
      it('returns 0 when account has no resources', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              findAsset(assets, KnownCaip19Id.MaximumBandwidthMainnet)
                ?.rawAmount,
            ).toBe('0');
          },
        );
      });

      it('returns only free bandwidth limit when no staking', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({}),
            );

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              findAsset(assets, KnownCaip19Id.MaximumBandwidthMainnet)
                ?.rawAmount,
            ).toBe('600');
          },
        );
      });

      it('returns free + staked bandwidth limit', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({ NetLimit: 48 }),
            );

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              findAsset(assets, KnownCaip19Id.MaximumBandwidthMainnet)
                ?.rawAmount,
            ).toBe('648');
          },
        );
      });
    });

    describe('TRX ready for withdrawal', () => {
      it('returns zero balance when account has no unfrozenV2 data', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              createMockTronAccount({
                address: mockAccount.address,
                unfrozenV2: [],
              }),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            const readyForWithdrawalAsset = findAsset(
              assets,
              KnownCaip19Id.TrxReadyForWithdrawalMainnet,
            );
            expect(readyForWithdrawalAsset).toBeDefined();
            expect(readyForWithdrawalAsset?.rawAmount).toBe('0');
          },
        );
      });

      it('returns ready for withdrawal amount when unfrozenV2 has expired entries', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            const pastTime = Date.now() - 1000;
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              createMockTronAccount({
                address: mockAccount.address,
                unfrozenV2: [
                  { unfreeze_amount: 1000000, unfreeze_expire_time: pastTime },
                ],
              }),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            const readyForWithdrawalAsset = findAsset(
              assets,
              KnownCaip19Id.TrxReadyForWithdrawalMainnet,
            );
            expect(readyForWithdrawalAsset).toBeDefined();
            expect(readyForWithdrawalAsset?.rawAmount).toBe('1000000');
          },
        );
      });

      it('returns zero balance when unfrozenV2 has not expired', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            const futureTime = Date.now() + 1000000;
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              createMockTronAccount({
                address: mockAccount.address,
                unfrozenV2: [
                  {
                    unfreeze_amount: 1000000,
                    unfreeze_expire_time: futureTime,
                  },
                ],
              }),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            const readyForWithdrawalAsset = findAsset(
              assets,
              KnownCaip19Id.TrxReadyForWithdrawalMainnet,
            );
            expect(readyForWithdrawalAsset).toBeDefined();
            expect(readyForWithdrawalAsset?.rawAmount).toBe('0');
          },
        );
      });

      it('sums multiple expired unfrozen entries', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            const pastTime1 = Date.now() - 1000;
            const pastTime2 = Date.now() - 2000;
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              createMockTronAccount({
                address: mockAccount.address,
                unfrozenV2: [
                  { unfreeze_amount: 1000000, unfreeze_expire_time: pastTime1 },
                  { unfreeze_amount: 2000000, unfreeze_expire_time: pastTime2 },
                ],
              }),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            const readyForWithdrawalAsset = findAsset(
              assets,
              KnownCaip19Id.TrxReadyForWithdrawalMainnet,
            );
            expect(readyForWithdrawalAsset).toBeDefined();
            expect(readyForWithdrawalAsset?.rawAmount).toBe('3000000');
          },
        );
      });

      it('only includes expired entries when mixed with non-expired', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            const pastTime = Date.now() - 1000;
            const futureTime = Date.now() + 1000000;
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              createMockTronAccount({
                address: mockAccount.address,
                unfrozenV2: [
                  { unfreeze_amount: 1000000, unfreeze_expire_time: pastTime },
                  {
                    unfreeze_amount: 5000000,
                    unfreeze_expire_time: futureTime,
                  },
                ],
              }),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            const readyForWithdrawalAsset = findAsset(
              assets,
              KnownCaip19Id.TrxReadyForWithdrawalMainnet,
            );
            expect(readyForWithdrawalAsset).toBeDefined();
            expect(readyForWithdrawalAsset?.rawAmount).toBe('1000000');
          },
        );
      });
    });

    describe('TRX in lock period', () => {
      it('returns zero balance when account has no unfrozenV2 data', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              createMockTronAccount({
                address: mockAccount.address,
                unfrozenV2: [],
              }),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            const inLockPeriodAsset = findAsset(
              assets,
              KnownCaip19Id.TrxInLockPeriodMainnet,
            );
            expect(inLockPeriodAsset).toBeDefined();
            expect(inLockPeriodAsset?.rawAmount).toBe('0');
          },
        );
      });

      it('returns in lock period amount when unfrozenV2 has future entries', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            const futureTime = Date.now() + 1000000;
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              createMockTronAccount({
                address: mockAccount.address,
                unfrozenV2: [
                  {
                    unfreeze_amount: 1000000,
                    unfreeze_expire_time: futureTime,
                  },
                ],
              }),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            const inLockPeriodAsset = findAsset(
              assets,
              KnownCaip19Id.TrxInLockPeriodMainnet,
            );
            expect(inLockPeriodAsset).toBeDefined();
            expect(inLockPeriodAsset?.rawAmount).toBe('1000000');
          },
        );
      });

      it('returns zero balance when unfrozenV2 has already expired', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            const pastTime = Date.now() - 1000;
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              createMockTronAccount({
                address: mockAccount.address,
                unfrozenV2: [
                  {
                    unfreeze_amount: 1000000,
                    unfreeze_expire_time: pastTime,
                  },
                ],
              }),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            const inLockPeriodAsset = findAsset(
              assets,
              KnownCaip19Id.TrxInLockPeriodMainnet,
            );
            expect(inLockPeriodAsset).toBeDefined();
            expect(inLockPeriodAsset?.rawAmount).toBe('0');
          },
        );
      });

      it('sums multiple non-expired unfrozen entries', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            const futureTime1 = Date.now() + 1000000;
            const futureTime2 = Date.now() + 2000000;
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              createMockTronAccount({
                address: mockAccount.address,
                unfrozenV2: [
                  {
                    unfreeze_amount: 1000000,
                    unfreeze_expire_time: futureTime1,
                  },
                  {
                    unfreeze_amount: 2000000,
                    unfreeze_expire_time: futureTime2,
                  },
                ],
              }),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            const inLockPeriodAsset = findAsset(
              assets,
              KnownCaip19Id.TrxInLockPeriodMainnet,
            );
            expect(inLockPeriodAsset).toBeDefined();
            expect(inLockPeriodAsset?.rawAmount).toBe('3000000');
          },
        );
      });

      it('only includes non-expired entries when mixed with expired', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            const pastTime = Date.now() - 1000;
            const futureTime = Date.now() + 1000000;
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              createMockTronAccount({
                address: mockAccount.address,
                unfrozenV2: [
                  { unfreeze_amount: 1000000, unfreeze_expire_time: pastTime },
                  {
                    unfreeze_amount: 5000000,
                    unfreeze_expire_time: futureTime,
                  },
                ],
              }),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            const inLockPeriodAsset = findAsset(
              assets,
              KnownCaip19Id.TrxInLockPeriodMainnet,
            );
            expect(inLockPeriodAsset).toBeDefined();
            expect(inLockPeriodAsset?.rawAmount).toBe('5000000');
          },
        );
      });

      it('returns zero balance for inactive accounts', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockRejectedValue(
              new Error('account not found'),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            const inLockPeriodAsset = findAsset(
              assets,
              KnownCaip19Id.TrxInLockPeriodMainnet,
            );
            expect(inLockPeriodAsset).toBeDefined();
            expect(inLockPeriodAsset?.rawAmount).toBe('0');
          },
        );
      });
    });

    describe('energy', () => {
      it('returns 0 when account has no resources', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              findAsset(assets, KnownCaip19Id.EnergyMainnet)?.rawAmount,
            ).toBe('0');
          },
        );
      });

      it('returns full energy when none consumed', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({ EnergyLimit: 329 }),
            );

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              findAsset(assets, KnownCaip19Id.EnergyMainnet)?.rawAmount,
            ).toBe('329');
          },
        );
      });

      it('returns remaining energy after partial consumption', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({ EnergyLimit: 5000, EnergyUsed: 4383 }),
            );

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              findAsset(assets, KnownCaip19Id.EnergyMainnet)?.rawAmount,
            ).toBe('617');
          },
        );
      });

      it('clamps to 0 when EnergyUsed exceeds EnergyLimit from leasing', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({ EnergyLimit: 46, EnergyUsed: 6511 }),
            );

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              findAsset(assets, KnownCaip19Id.EnergyMainnet)?.rawAmount,
            ).toBe('0');
          },
        );
      });
    });

    describe('maximum energy', () => {
      it('returns 0 when account has no resources', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              findAsset(assets, KnownCaip19Id.MaximumEnergyMainnet)?.rawAmount,
            ).toBe('0');
          },
        );
      });

      it('returns EnergyLimit from staking', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({ EnergyLimit: 329 }),
            );

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              findAsset(assets, KnownCaip19Id.MaximumEnergyMainnet)?.rawAmount,
            ).toBe('329');
          },
        );
      });
    });

    describe('staking rewards', () => {
      it('returns 0 when account has no staking rewards', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});
            mockTronHttpClient.getReward.mockResolvedValue(0);

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              findAsset(assets, KnownCaip19Id.TrxStakingRewardsMainnet)
                ?.rawAmount,
            ).toBe('0');
          },
        );
      });

      it('returns staking rewards when account has unclaimed rewards', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});
            mockTronHttpClient.getReward.mockResolvedValue(5000000);

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            const stakingRewardsAsset = findAsset(
              assets,
              KnownCaip19Id.TrxStakingRewardsMainnet,
            );
            expect(stakingRewardsAsset?.rawAmount).toBe('5000000');
            expect(stakingRewardsAsset?.uiAmount).toBe('5');
            expect(stakingRewardsAsset?.symbol).toBe('trx-staking-rewards');
          },
        );
      });

      it('gracefully handles staking rewards API failure', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});
            mockTronHttpClient.getReward.mockRejectedValue(
              new Error('API Error'),
            );

            const assets = await syncAndGetSavedAssets(
              assetsService,
              mockAssetsRepository,
            );

            expect(
              findAsset(assets, KnownCaip19Id.TrxStakingRewardsMainnet)
                ?.rawAmount,
            ).toBe('0');
          },
        );
      });
    });

    describe('persistence and events via sync', () => {
      it('does not remove energy and bandwidth assets even when they have zero amounts', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            await assetsService.syncSnapOwnedAssets(
              [mockAccount],
              [Network.Mainnet],
            );

            const savedAssets =
              mockAssetsRepository.saveMany.mock.calls[0]?.[0] ?? [];
            expect(
              savedAssets.some(
                (asset) => asset.assetType === KnownCaip19Id.EnergyMainnet,
              ),
            ).toBe(true);
            expect(
              savedAssets.some(
                (asset) => asset.assetType === KnownCaip19Id.BandwidthMainnet,
              ),
            ).toBe(true);
            expect(
              savedAssets.some(
                (asset) => asset.assetType === KnownCaip19Id.TrxMainnet,
              ),
            ).toBe(false);
            expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
              expect.anything(),
              KeyringEvent.AccountAssetListUpdated,
              {
                assets: {
                  [mockAccount.id]: {
                    added: expect.arrayContaining([
                      KnownCaip19Id.EnergyMainnet,
                      KnownCaip19Id.BandwidthMainnet,
                    ]),
                    removed: [],
                  },
                },
              },
            );
          },
        );
      });

      it('does not zero or remove TRC20 when missing from sync snapshot', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            const trc20AssetId = `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;
            const savedAssets: AssetEntity[] = [
              {
                assetType: KnownCaip19Id.TrxMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'TRX',
                decimals: 6,
                rawAmount: '1000000',
                uiAmount: '1',
                iconUrl: '',
              },
              {
                assetType: trc20AssetId,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'USDT',
                decimals: 6,
                rawAmount: '1658250000',
                uiAmount: '1658.25',
                iconUrl: '',
              },
            ];

            mockAssetsRepository.getAll.mockResolvedValue(savedAssets);
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({ EnergyLimit: 329 }),
            );

            await assetsService.syncSnapOwnedAssets(
              [mockAccount],
              [Network.Mainnet],
            );

            const persistedAssets =
              mockAssetsRepository.saveMany.mock.calls[0]?.[0] ?? [];
            expect(
              persistedAssets.find((asset) => asset.assetType === trc20AssetId),
            ).toBeUndefined();
            expect(
              persistedAssets.find(
                (asset) => asset.assetType === KnownCaip19Id.TrxMainnet,
              ),
            ).toBeUndefined();
            expect(
              persistedAssets.find(
                (asset) => asset.assetType === KnownCaip19Id.EnergyMainnet,
              ),
            ).toBeDefined();
          },
        );
      });

      it('keeps maximum energy and bandwidth assets even with zero amounts', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            await assetsService.syncSnapOwnedAssets(
              [mockAccount],
              [Network.Mainnet],
            );

            const savedAssets =
              mockAssetsRepository.saveMany.mock.calls[0]?.[0] ?? [];
            expect(
              savedAssets.some(
                (asset) =>
                  asset.assetType === KnownCaip19Id.MaximumEnergyMainnet,
              ),
            ).toBe(true);
            expect(
              savedAssets.some(
                (asset) =>
                  asset.assetType === KnownCaip19Id.MaximumBandwidthMainnet,
              ),
            ).toBe(true);
          },
        );
      });

      it('keeps staked assets even with zero amounts', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            await assetsService.syncSnapOwnedAssets(
              [mockAccount],
              [Network.Mainnet],
            );

            const savedAssets =
              mockAssetsRepository.saveMany.mock.calls[0]?.[0] ?? [];
            expect(
              savedAssets.some(
                (asset) =>
                  asset.assetType ===
                  KnownCaip19Id.TrxStakedForBandwidthMainnet,
              ),
            ).toBe(true);
            expect(
              savedAssets.some(
                (asset) =>
                  asset.assetType === KnownCaip19Id.TrxStakedForEnergyMainnet,
              ),
            ).toBe(true);
          },
        );
      });

      it('keeps ready for withdrawal assets even with zero amounts', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            await assetsService.syncSnapOwnedAssets(
              [mockAccount],
              [Network.Mainnet],
            );

            const savedAssets =
              mockAssetsRepository.saveMany.mock.calls[0]?.[0] ?? [];
            expect(
              savedAssets.some(
                (asset) =>
                  asset.assetType ===
                  KnownCaip19Id.TrxReadyForWithdrawalMainnet,
              ),
            ).toBe(true);
          },
        );
      });

      it('emits balance updates when snap-owned energy increases', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            const savedAssets: AssetEntity[] = [
              {
                assetType: KnownCaip19Id.EnergyMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'ENERGY',
                decimals: 0,
                rawAmount: '0',
                uiAmount: '0',
                iconUrl: '',
              },
            ];

            mockAssetsRepository.getAll.mockResolvedValue(savedAssets);
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({ EnergyLimit: 50000 }),
            );

            await assetsService.syncSnapOwnedAssets(
              [mockAccount],
              [Network.Mainnet],
            );

            expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
              expect.anything(),
              KeyringEvent.AccountBalancesUpdated,
              {
                balances: {
                  [mockAccount.id]: expect.objectContaining({
                    [KnownCaip19Id.EnergyMainnet]: {
                      unit: 'ENERGY',
                      amount: '50000',
                    },
                  }),
                },
              },
            );
          },
        );
      });

      it('emits balance updates when snap-owned energy decreases but remains >0', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockAssetsRepository,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            const savedAssets: AssetEntity[] = [
              {
                assetType: KnownCaip19Id.EnergyMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'ENERGY',
                decimals: 0,
                rawAmount: '100000',
                uiAmount: '100000',
                iconUrl: '',
              },
            ];

            mockAssetsRepository.getAll.mockResolvedValue(savedAssets);
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({
                EnergyLimit: 100000,
                EnergyUsed: 65000,
              }),
            );

            await assetsService.syncSnapOwnedAssets(
              [mockAccount],
              [Network.Mainnet],
            );

            expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
              expect.anything(),
              KeyringEvent.AccountBalancesUpdated,
              {
                balances: {
                  [mockAccount.id]: expect.objectContaining({
                    [KnownCaip19Id.EnergyMainnet]: {
                      unit: 'ENERGY',
                      amount: '35000',
                    },
                  }),
                },
              },
            );
          },
        );
      });
    });
  });

  describe('getAssetsMetadata', () => {
    it('resolves metadata for native, protocol, and token asset types', async () => {
      await withAssetsService(async ({ assetsService, mockTokenApiClient }) => {
        const trc20 =
          `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` as TokenCaipAssetType;
        const trc10 = `${Network.Mainnet}/trc10:1002000` as TokenCaipAssetType;

        mockTokenApiClient.getTokensMetadata.mockResolvedValue({
          [trc20]: {
            fungible: { symbol: 'USDT', name: 'Tether', decimals: 6 },
          },
          [trc10]: {
            fungible: { symbol: 'T', name: 'Token', decimals: 0 },
          },
        } as never);

        const assetTypes = [
          KnownCaip19Id.TrxMainnet,
          KnownCaip19Id.TrxStakedForBandwidthMainnet,
          KnownCaip19Id.TrxStakedForEnergyMainnet,
          KnownCaip19Id.TrxReadyForWithdrawalMainnet,
          KnownCaip19Id.TrxInLockPeriodMainnet,
          KnownCaip19Id.TrxStakingRewardsMainnet,
          KnownCaip19Id.EnergyMainnet,
          KnownCaip19Id.MaximumEnergyMainnet,
          KnownCaip19Id.BandwidthMainnet,
          KnownCaip19Id.MaximumBandwidthMainnet,
          trc10,
          trc20,
        ];

        const metadata = await assetsService.getAssetsMetadata(assetTypes);

        expect(metadata[KnownCaip19Id.TrxMainnet]?.symbol).toBe('TRX');
        expect(metadata[KnownCaip19Id.EnergyMainnet]?.symbol).toBe('ENERGY');
        expect(metadata[trc20]?.fungible?.symbol).toBe('USDT');
        expect(mockTokenApiClient.getTokensMetadata).toHaveBeenCalledWith([
          trc10,
          trc20,
        ]);
      });
    });
  });

  describe('AssetsController routing', () => {
    const accountId = mockAccount.id;
    const fungibleAssetId = KnownCaip19Id.TrxMainnet;
    const snapAssetId = KnownCaip19Id.EnergyMainnet;

    it('syncSnapOwnedAssets returns protocol assets only', async () => {
      await withAssetsService(
        async ({
          assetsService,
          mockAssetsRepository,
          mockTrongridApiClient,
          mockTronHttpClient,
        }) => {
          mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
            createMockTronAccount({
              address: mockAccount.address,
              balance: 1_000_000,
              trc20: [{ TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: '1000' }],
            }),
          );
          mockTronHttpClient.getAccountResources.mockResolvedValue(
            emptyAccountResources,
          );

          await assetsService.syncSnapOwnedAssets(
            [mockAccount],
            [Network.Mainnet],
          );

          const assets =
            mockAssetsRepository.saveMany.mock.calls.at(-1)?.[0] ?? [];

          expect(
            assets.every((asset: AssetEntity) =>
              SNAP_OWNED_ASSETS.includes(asset.assetType),
            ),
          ).toBe(true);
          expect(
            assets.some(
              (asset: AssetEntity) => asset.assetType === fungibleAssetId,
            ),
          ).toBe(false);
        },
      );
    });

    it('routes snap-owned reads through the repository', async () => {
      await withAssetsService(
        async ({ assetsService, mockAssetsRepository, mockCoreMessenger }) => {
          const snapAsset: AssetEntity = {
            assetType: snapAssetId,
            keyringAccountId: accountId,
            network: Network.Mainnet,
            symbol: 'ENERGY',
            decimals: 0,
            rawAmount: '100',
            uiAmount: '100',
            iconUrl: '',
          };
          mockAssetsRepository.getByAccountIdAndAssetType.mockResolvedValue(
            snapAsset,
          );

          const asset = await assetsService.getAccountAssetByID(
            accountId,
            snapAssetId,
          );

          expect(asset).toStrictEqual(snapAsset);
          expect(mockCoreMessenger.call).not.toHaveBeenCalledWith(
            'AssetsController:getAccountAssetByID',
            expect.anything(),
            expect.anything(),
          );
        },
      );
    });

    it('routes fungible reads through AssetsController', async () => {
      await withAssetsService(async ({ assetsService, mockCoreMessenger }) => {
        mockCoreMessenger.call.mockImplementation(
          createMessengerCallMock(
            jest.fn().mockResolvedValue(
              buildControllerAsset(fungibleAssetId, '2000000', {
                symbol: 'TRX',
                name: 'TRON',
                decimals: 6,
              }),
            ),
          ),
        );

        const asset = await assetsService.getAccountAssetByID(
          accountId,
          fungibleAssetId,
        );

        expect(asset).toMatchObject({
          assetType: fungibleAssetId,
          rawAmount: '2000000',
          uiAmount: '2',
        });
      });
    });

    it('getAccountAssetsByIDs uses a single AssetsController:getAccountAssetsByIDs call for fungibles', async () => {
      await withAssetsService(async ({ assetsService, mockCoreMessenger }) => {
        const trx = KnownCaip19Id.TrxMainnet;
        const usdt = `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;

        mockCoreMessenger.call.mockImplementation(
          createMessengerCallMock(
            jest.fn(),
            jest.fn().mockImplementation(async () => {
              return {
                [trx as Caip19AssetId]: buildControllerAsset(trx, '1000000', {
                  symbol: 'TRX',
                  name: 'TRON',
                  decimals: 6,
                }),
                [usdt as Caip19AssetId]: buildControllerAsset(usdt, '500000', {
                  symbol: 'USDT',
                  name: 'Tether',
                  decimals: 6,
                }),
              };
            }),
          ),
        );

        const results = await assetsService.getAccountAssetsByIDs(accountId, [
          trx,
          usdt,
        ]);

        expect(mockCoreMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAccountAssetsByIDs',
          accountId,
          [trx, usdt],
        );
        expect(results[0]?.rawAmount).toBe('1000000');
        expect(results[1]?.rawAmount).toBe('500000');
      });
    });

    it('getAccountAssetsByIDs batches snap-owned reads without calling AssetsController', async () => {
      await withAssetsService(
        async ({ assetsService, mockAssetsRepository, mockCoreMessenger }) => {
          const snapAsset: AssetEntity = {
            assetType: snapAssetId,
            keyringAccountId: accountId,
            network: Network.Mainnet,
            symbol: 'ENERGY',
            decimals: 0,
            rawAmount: '100',
            uiAmount: '100',
            iconUrl: '',
          };
          mockAssetsRepository.getByAccountIdAndAssetType.mockResolvedValue(
            snapAsset,
          );

          const results = await assetsService.getAccountAssetsByIDs(accountId, [
            snapAssetId,
          ]);

          expect(results[0]).toStrictEqual(snapAsset);
          expect(mockCoreMessenger.call).not.toHaveBeenCalled();
        },
      );
    });

    it('getAccountAssetsByIDs merges snap-owned and fungible reads in request order', async () => {
      await withAssetsService(
        async ({ assetsService, mockAssetsRepository, mockCoreMessenger }) => {
          const snapAsset: AssetEntity = {
            assetType: snapAssetId,
            keyringAccountId: accountId,
            network: Network.Mainnet,
            symbol: 'ENERGY',
            decimals: 0,
            rawAmount: '250',
            uiAmount: '250',
            iconUrl: '',
          };
          mockAssetsRepository.getByAccountIdAndAssetType.mockResolvedValue(
            snapAsset,
          );

          mockCoreMessenger.call.mockImplementation(
            createMessengerCallMock(
              jest.fn(),
              jest.fn().mockImplementation(async () => {
                return {
                  [fungibleAssetId as Caip19AssetId]: buildControllerAsset(
                    fungibleAssetId,
                    '3000000',
                    {
                      symbol: 'TRX',
                      name: 'TRON',
                      decimals: 6,
                    },
                  ),
                };
              }),
            ),
          );

          const results = await assetsService.getAccountAssetsByIDs(accountId, [
            fungibleAssetId,
            snapAssetId,
          ]);

          expect(results[0]?.rawAmount).toBe('3000000');
          expect(results[1]).toStrictEqual(snapAsset);
          expect(mockCoreMessenger.call).toHaveBeenCalledWith(
            'AssetsController:getAccountAssetsByIDs',
            accountId,
            [fungibleAssetId],
          );
        },
      );
    });

    it('getByKeyringAccountId excludes fungibles', async () => {
      await withAssetsService(
        async ({ assetsService, mockAssetsRepository }) => {
          mockAssetsRepository.getByAccountId.mockResolvedValue([
            {
              assetType: fungibleAssetId,
              keyringAccountId: accountId,
              network: Network.Mainnet,
              symbol: 'TRX',
              decimals: 6,
              rawAmount: '1000000',
              uiAmount: '1',
              iconUrl: '',
            },
            {
              assetType: snapAssetId,
              keyringAccountId: accountId,
              network: Network.Mainnet,
              symbol: 'ENERGY',
              decimals: 0,
              rawAmount: '100',
              uiAmount: '100',
              iconUrl: '',
            },
          ]);

          const assets = await assetsService.getByKeyringAccountId(accountId);

          expect(
            assets.some(
              (asset: AssetEntity) => asset.assetType === fungibleAssetId,
            ),
          ).toBe(false);
          expect(
            assets.some(
              (asset: AssetEntity) => asset.assetType === snapAssetId,
            ),
          ).toBe(true);
        },
      );
    });

    it('syncSnapOwnedAssets emits only snap-owned assets', async () => {
      await withAssetsService(
        async ({
          assetsService,
          mockAssetsRepository,
          mockTrongridApiClient,
          mockTronHttpClient,
        }) => {
          mockAssetsRepository.getAll.mockResolvedValue([]);
          mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
            minimalTronAccount,
          );
          mockTronHttpClient.getAccountResources.mockResolvedValue(
            getMockAccountResources({ EnergyLimit: 100 }),
          );

          await assetsService.syncSnapOwnedAssets(
            [mockAccount],
            [Network.Mainnet],
          );

          expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
            expect.anything(),
            KeyringEvent.AccountAssetListUpdated,
            expect.objectContaining({
              assets: expect.objectContaining({
                [accountId]: expect.objectContaining({
                  added: expect.arrayContaining([snapAssetId]),
                }),
              }),
            }),
          );
        },
      );
    });
  });

  describe('getHistoricalPrice', () => {
    it('tracks historical price errors', async () => {
      await withAssetsService(
        async ({ assetsService, mockSnapClient, mockPriceApiClient }) => {
          const error = new Error('Price error');

          mockPriceApiClient.getHistoricalPrices.mockRejectedValue(error);

          await assetsService.getHistoricalPrice(
            KnownCaip19Id.TrxMainnet,
            'tron:728126428/slip44:usd',
          );

          expect(mockSnapClient.trackError).toHaveBeenCalledWith(error);
        },
      );
    });
  });

  describe('facade delegation', () => {
    it('routes fungible reads through AssetsProvider and keeps handler logic in AssetsService', async () => {
      await withAssetsService(
        async ({
          assetsService,
          mockAssetsRepository,
          mockCoreMessenger,
          mockPriceApiClient,
        }) => {
          const snapAsset: AssetEntity = {
            assetType: KnownCaip19Id.EnergyMainnet,
            keyringAccountId: mockAccount.id,
            network: Network.Mainnet,
            symbol: 'ENERGY',
            decimals: 0,
            rawAmount: '1',
            uiAmount: '1',
          };

          mockAssetsRepository.getByAccountId.mockResolvedValue([snapAsset]);
          mockAssetsRepository.getByAccountIdAndAssetType.mockResolvedValue(
            snapAsset,
          );
          mockCoreMessenger.call.mockImplementation(
            createMessengerCallMock(
              jest.fn().mockResolvedValue(
                buildControllerAsset(KnownCaip19Id.TrxMainnet, '1', {
                  symbol: 'TRX',
                  name: 'TRON',
                  decimals: 6,
                }),
              ),
            ),
          );
          mockPriceApiClient.getFiatExchangeRates.mockResolvedValue({
            usd: { value: 1 },
          });
          mockPriceApiClient.getMultipleSpotPrices.mockResolvedValue(
            createSpotPrices({
              [KnownCaip19Id.TrxMainnet]: {
                id: KnownCaip19Id.TrxMainnet,
                price: 1,
              },
            }),
          );

          expect(AssetsService.isFiat('eip155:1/erc20:0x0')).toBe(false);
          expect(AssetsService.isFiat('swift:0/iso4217:usd')).toBe(true);

          expect(
            await assetsService.getAccountAssetByID(
              mockAccount.id,
              KnownCaip19Id.TrxMainnet,
            ),
          ).toMatchObject({
            assetType: KnownCaip19Id.TrxMainnet,
            rawAmount: '1',
          });
          expect(
            await assetsService.getAccountAssetByID(
              mockAccount.id,
              KnownCaip19Id.EnergyMainnet,
            ),
          ).toStrictEqual(snapAsset);
          const byKeyringAccountId = await assetsService.getByKeyringAccountId(
            mockAccount.id,
          );
          expect(
            byKeyringAccountId.some(
              (savedAsset) =>
                savedAsset.assetType === KnownCaip19Id.EnergyMainnet,
            ),
          ).toBe(true);
          const marketData = await assetsService.getMultipleTokensMarketData([
            {
              asset: KnownCaip19Id.TrxMainnet,
              unit: 'swift:0/iso4217:usd',
            },
          ]);
          expect(marketData[KnownCaip19Id.TrxMainnet]).toBeDefined();
          expect(assetsService.cacheTtlsMilliseconds.historicalPrices).toBe(
            3600000,
          );
        },
      );
    });
  });
});
