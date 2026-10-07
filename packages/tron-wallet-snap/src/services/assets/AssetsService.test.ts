import type { Asset, Caip19AssetId } from '@metamask/assets-controller';
import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
} from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import { KeyringEvent } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import {
  AssetsProvider,
  RemoteFeatureFlagsProvider,
} from '@metamask/snap-networks-utils';

import type { PriceApiClient } from '../../clients/price-api/PriceApiClient';
import type { SpotPrices } from '../../clients/price-api/types';
import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TokenApiClient } from '../../clients/token-api/TokenApiClient';
import type { AccountResources, TronHttpClient } from '../../clients/tron-http';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import { TrongridAccountNotFoundError } from '../../clients/trongrid/errors';
import type { TronAccount } from '../../clients/trongrid/types';
import { KnownCaip19Id, Network } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import type { CoreMessengerCaller } from '../../types/core-messenger';
import { mockLogger } from '../../utils/mockLogger';
import { CoreAssetsAdapter } from './adapters/CoreAssetsAdapter';
import { SnapAssetsAdapter } from './adapters/SnapAssetsAdapter';
import type { AssetsRepository } from './AssetsRepository';
import type { NativeCaipAssetType, TokenCaipAssetType } from './types';

/**
 * Subset of State methods.
 */
type MockState = {
  getKey: jest.Mock;
  setKey: jest.Mock;
  setKeyWith: jest.Mock;
};

jest.mock('@metamask/keyring-snap-sdk', () => ({
  emitSnapKeyringEvent: jest.fn(),
}));

(global as any).snap = {};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AssetsService } = require('./AssetsService');

const TRON_FLAG_KEY = SNAPS_ASSETS_MIGRATION_FLAG_KEYS.tron;

function createMessengerCallMock(
  getState: () => unknown,
  getAccountAssetByID: jest.Mock,
  getAccountAssetsByIDs: jest.Mock = jest.fn().mockResolvedValue({}),
  getAccountAssetsByScope: jest.Mock = jest.fn().mockResolvedValue({}),
  getAssets: jest.Mock = jest.fn().mockResolvedValue({}),
): CoreMessengerCaller['call'] {
  return async (actionType, ...args) => {
    switch (actionType) {
      case 'RemoteFeatureFlagController:getState':
        return getState() as Awaited<ReturnType<CoreMessengerCaller['call']>>;
      case 'AssetsController:getAccountAssetByID':
        return getAccountAssetByID(...args);
      case 'AssetsController:getAccountAssetsByIDs':
        return getAccountAssetsByIDs(...args);
      case 'AssetsController:getAccountAssetsByScope':
        return getAccountAssetsByScope(...args);
      case 'AssetsController:getAssets':
        return getAssets(...args);
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

/**
 * Builds a SpotPrices map for test mocks.
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

/**
 * Finds an asset by its CAIP-19 asset type.
 *
 * @param assets - The list of assets to search.
 * @param assetType - The CAIP-19 asset type to match.
 * @returns The matching asset, or undefined.
 */
function findAsset(
  assets: AssetEntity[],
  assetType: KnownCaip19Id,
): AssetEntity | undefined {
  return assets.find((a: AssetEntity) => a.assetType === assetType);
}

type WithAssetsServiceCallback<ReturnValue> = (payload: {
  assetsService: InstanceType<typeof AssetsService>;
  mockAssetsRepository: jest.Mocked<
    Pick<
      AssetsRepository,
      | 'saveMany'
      | 'getByAccountId'
      | 'getByAccountIdAndAssetType'
      | 'getByAccountIdAndAssetTypes'
    >
  >;
  mockState: MockState;
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
    Pick<PriceApiClient, 'getMultipleSpotPrices'>
  >;
  mockTokenApiClient: jest.Mocked<Pick<TokenApiClient, 'getTokensMetadata'>>;
  mockSnapClient: jest.Mocked<Pick<SnapClient, 'trackError'>>;
  mockCoreMessenger: jest.Mocked<CoreMessengerCaller>;
  mockGetAssets: jest.Mock;
  setMigrationStage: (stage: SnapsAssetsMigrationStage) => void;
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
      | 'getByAccountId'
      | 'getByAccountIdAndAssetType'
      | 'getByAccountIdAndAssetTypes'
      | 'saveMany'
    >
  > = {
    saveMany: jest.fn().mockResolvedValue(undefined),
    getByAccountId: jest.fn().mockResolvedValue([]),
    getByAccountIdAndAssetType: jest.fn().mockResolvedValue(null),
    getByAccountIdAndAssetTypes: jest.fn().mockResolvedValue([]),
  };

  const mockState: MockState = {
    getKey: jest.fn().mockResolvedValue({}),
    setKey: jest.fn().mockResolvedValue(undefined),
    setKeyWith: jest.fn().mockResolvedValue(undefined),
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
    Pick<PriceApiClient, 'getMultipleSpotPrices'>
  > = {
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
  const mockGetAssets = jest.fn().mockResolvedValue({});
  let migrationStage = SnapsAssetsMigrationStage.Off;
  const mockCoreMessenger: jest.Mocked<CoreMessengerCaller> = {
    call: jest.fn().mockImplementation(
      createMessengerCallMock(
        () => ({
          remoteFeatureFlags: {
            [TRON_FLAG_KEY]: { stage: migrationStage },
          },
        }),
        mockGetAccountAssetByID,
        mockGetAccountAssetsByIDs,
        mockGetAccountAssetsByScope,
        mockGetAssets,
      ),
    ),
  };

  const setMigrationStage = (stage: SnapsAssetsMigrationStage): void => {
    migrationStage = stage;
  };

  const assetsProvider = new AssetsProvider({
    messenger: mockCoreMessenger as never,
  });
  const remoteFeatureFlagsProvider = new RemoteFeatureFlagsProvider({
    messenger: mockCoreMessenger as never,
  });

  const snapAdapter = new SnapAssetsAdapter({
    logger: mockLogger,
    assetsRepository: mockAssetsRepository as never,
    state: mockState as never,
    trongridApiClient: mockTrongridApiClient as never,
    tronHttpClient: mockTronHttpClient as never,
    priceApiClient: mockPriceApiClient as never,
    tokenApiClient: mockTokenApiClient as never,
    snapClient: mockSnapClient as never,
  });
  const coreAdapter = new CoreAssetsAdapter({
    getAccountAssetByID:
      assetsProvider.getAccountAssetByID.bind(assetsProvider),
    getAccountAssetsByIDs:
      assetsProvider.getAccountAssetsByIDs.bind(assetsProvider),
    getAccountAssetsByScope:
      assetsProvider.getAccountAssetsByScope.bind(assetsProvider),
    getAssets: assetsProvider.getAssets.bind(assetsProvider),
    fetchSnapOwnedAssets:
      snapAdapter.fetchAssetsAndBalancesForAccount.bind(snapAdapter),
  });

  const assetsService = new AssetsService({
    snapAdapter,
    coreAdapter,
    remoteFeatureFlagsProvider,
  });

  return await testFunction({
    assetsService,
    mockAssetsRepository,
    mockState,
    mockTrongridApiClient,
    mockTronHttpClient,
    mockPriceApiClient,
    mockTokenApiClient,
    mockSnapClient,
    mockCoreMessenger,
    mockGetAssets,
    setMigrationStage,
  });
}

describe('AssetsService', () => {
  describe('fetchAccountAssets', () => {
    it('fetches live assets from the chain for all the account scopes', async () => {
      await withAssetsService(
        async ({
          assetsService,
          mockTrongridApiClient,
          mockTronHttpClient,
        }) => {
          mockTronHttpClient.getAccountResources.mockResolvedValue(
            emptyAccountResources,
          );
          mockTrongridApiClient.getAccountInfoByAddress
            .mockResolvedValueOnce(
              createMockTronAccount({
                address: mockAccount.address,
                balance: 1_000_000,
              }),
            )
            .mockResolvedValueOnce(
              createMockTronAccount({
                address: mockAccount.address,
                balance: 2_000_000,
              }),
            );

          const account: KeyringAccount = {
            ...mockAccount,
            scopes: [Network.Mainnet, Network.Shasta],
          };

          const assets = await assetsService.fetchAccountAssets(account);

          expect(
            mockTrongridApiClient.getAccountInfoByAddress,
          ).toHaveBeenCalledTimes(2);
          expect(
            mockTrongridApiClient.getAccountInfoByAddress,
          ).toHaveBeenNthCalledWith(1, Network.Mainnet, mockAccount.address);
          expect(
            mockTrongridApiClient.getAccountInfoByAddress,
          ).toHaveBeenNthCalledWith(2, Network.Shasta, mockAccount.address);
          expect(findAsset(assets, KnownCaip19Id.TrxMainnet)?.rawAmount).toBe(
            '1000000',
          );
          expect(findAsset(assets, KnownCaip19Id.TrxShasta)?.rawAmount).toBe(
            '2000000',
          );
        },
      );
    });

    it('routes through the AssetsController fetch pipeline when migration is active', async () => {
      await withAssetsService(
        async ({ assetsService, mockGetAssets, setMigrationStage }) => {
          setMigrationStage(
            SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback,
          );

          const usdtAssetId =
            `${String(Network.Mainnet)}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` as const;
          mockGetAssets.mockResolvedValue({
            [mockAccount.id]: {
              [KnownCaip19Id.TrxMainnet]: buildControllerAsset(
                KnownCaip19Id.TrxMainnet,
                '1',
                { symbol: 'TRX', name: 'TRON', decimals: 6 },
              ),
              [usdtAssetId]: buildControllerAsset(usdtAssetId, '0.5', {
                symbol: 'USDT',
                name: 'Tether',
                decimals: 6,
              }),
            },
          });

          const assets = await assetsService.fetchAccountAssets(mockAccount);

          expect(mockGetAssets).toHaveBeenCalledWith(
            [expect.objectContaining({ id: mockAccount.id })],
            {
              chainIds: [mockAccount.scopes[0]],
              forceUpdate: true,
              bypassServerCache: true,
            },
          );
          expect(
            assets.some(
              (asset: AssetEntity) =>
                asset.assetType === KnownCaip19Id.TrxMainnet,
            ),
          ).toBe(true);
          expect(
            assets.some(
              (asset: AssetEntity) => asset.assetType === usdtAssetId,
            ),
          ).toBe(true);
        },
      );
    });
  });

  describe('fetchAccountAssetsFromTrongrid', () => {
    it('always hits the chain through the Snap adapter regardless of the migration stage', async () => {
      await withAssetsService(
        async ({
          assetsService,
          mockTrongridApiClient,
          mockTronHttpClient,
          mockPriceApiClient,
          setMigrationStage,
        }) => {
          setMigrationStage(
            SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback,
          );

          mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
            createMockTronAccount({
              address: mockAccount.address,
              balance: 1_000_000,
              trc20: [{ TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: '24249143' }],
            }),
          );
          mockTronHttpClient.getAccountResources.mockResolvedValue(
            emptyAccountResources,
          );

          const usdtAssetId =
            `${String(Network.Mainnet)}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` as const;
          mockPriceApiClient.getMultipleSpotPrices.mockResolvedValue(
            createSpotPrices({
              [KnownCaip19Id.TrxMainnet]: {
                id: KnownCaip19Id.TrxMainnet,
                price: 1.0,
              },
              [usdtAssetId]: { id: usdtAssetId, price: 1.0 },
            }),
          );

          const assets =
            await assetsService.fetchAccountAssetsFromTrongrid(mockAccount);

          // Fungible assets are returned even though the migration is
          // active: the TronGrid fallback never depends on the flag state.
          expect(
            assets.some(
              (asset: AssetEntity) =>
                asset.assetType === KnownCaip19Id.TrxMainnet,
            ),
          ).toBe(true);
          expect(
            assets.some(
              (asset: AssetEntity) => asset.assetType === usdtAssetId,
            ),
          ).toBe(true);
        },
      );
    });
  });

  describe('saveMany', () => {
    it('does not remove energy and bandwidth assets even when they have zero amounts', async () => {
      await withAssetsService(
        async ({ assetsService, mockState, mockAssetsRepository }) => {
          const assets: AssetEntity[] = [
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
              assetType: KnownCaip19Id.EnergyMainnet,
              keyringAccountId: mockAccount.id,
              network: Network.Mainnet,
              symbol: 'ENERGY',
              decimals: 0,
              rawAmount: '0',
              uiAmount: '0',
              iconUrl: '',
            },
            {
              assetType: KnownCaip19Id.BandwidthMainnet,
              keyringAccountId: mockAccount.id,
              network: Network.Mainnet,
              symbol: 'BANDWIDTH',
              decimals: 0,
              rawAmount: '0',
              uiAmount: '0',
              iconUrl: '',
            },
          ];

          mockState.getKey.mockResolvedValue(assets);

          await assetsService.saveMany(assets);

          expect(mockAssetsRepository.saveMany).toHaveBeenCalledWith(assets);
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

    it('correctly updates non-essential assets with zero amounts', async () => {
      await withAssetsService(async ({ assetsService, mockState }) => {
        const trc20AssetId =
          `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` as const;
        const assets: AssetEntity[] = [
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
            rawAmount: '0',
            uiAmount: '0',
            iconUrl: '',
          },
        ];

        mockState.getKey.mockResolvedValue({
          [mockAccount.id]: assets,
        });

        await assetsService.saveMany(assets);

        expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
          expect.anything(),
          KeyringEvent.AccountAssetListUpdated,
          {
            assets: {
              [mockAccount.id]: {
                added: [KnownCaip19Id.TrxMainnet],
                removed: [trc20AssetId],
              },
            },
          },
        );
      });
    });

    it('updates stale non-essential assets balance to 0 if missed from the latest snapshot', async () => {
      await withAssetsService(
        async ({ assetsService, mockState, mockAssetsRepository }) => {
          const trc20AssetId =
            `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` as const;
          const savedAssets: AssetEntity[] = [
            {
              assetType: KnownCaip19Id.TrxMainnet as NativeCaipAssetType,
              keyringAccountId: mockAccount.id,
              network: Network.Mainnet,
              symbol: 'TRX',
              decimals: 6,
              rawAmount: '1000000',
              uiAmount: '1',
              iconUrl: '',
            },
            {
              assetType: trc20AssetId as TokenCaipAssetType,
              keyringAccountId: mockAccount.id,
              network: Network.Mainnet,
              symbol: 'USDT',
              decimals: 6,
              rawAmount: '1658250000',
              uiAmount: '1658.25',
              iconUrl: '',
            },
          ];
          const finalSavedAssets: AssetEntity[] = [
            {
              assetType: KnownCaip19Id.TrxMainnet as NativeCaipAssetType,
              keyringAccountId: mockAccount.id,
              network: Network.Mainnet,
              symbol: 'TRX',
              decimals: 6,
              rawAmount: '1000000',
              uiAmount: '1',
              iconUrl: '',
            },
            {
              assetType: trc20AssetId as TokenCaipAssetType,
              keyringAccountId: mockAccount.id,
              network: Network.Mainnet,
              symbol: 'USDT',
              decimals: 6,
              rawAmount: '0',
              uiAmount: '0',
              iconUrl: '',
            },
          ];

          const updatedAssets: AssetEntity[] = [savedAssets[0] as AssetEntity];

          mockState.getKey.mockResolvedValue({
            [mockAccount.id]: savedAssets,
          });

          await assetsService.saveMany(updatedAssets);

          expect(mockAssetsRepository.saveMany).toHaveBeenCalledWith(
            finalSavedAssets,
          );
          expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
            expect.anything(),
            KeyringEvent.AccountAssetListUpdated,
            {
              assets: {
                [mockAccount.id]: {
                  added: [KnownCaip19Id.TrxMainnet],
                  removed: [trc20AssetId],
                },
              },
            },
          );

          expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
            expect.anything(),
            KeyringEvent.AccountBalancesUpdated,
            {
              balances: {
                [mockAccount.id]: {
                  [KnownCaip19Id.TrxMainnet]: {
                    unit: 'TRX',
                    amount: '1',
                  },
                  [trc20AssetId]: {
                    unit: 'USDT',
                    amount: '0',
                  },
                },
              },
            },
          );
        },
      );
    });

    it('keeps maximum energy and bandwidth assets even with zero amounts', async () => {
      await withAssetsService(
        async ({ assetsService, mockState, mockAssetsRepository }) => {
          const assets: AssetEntity[] = [
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
              assetType: KnownCaip19Id.MaximumEnergyMainnet,
              keyringAccountId: mockAccount.id,
              network: Network.Mainnet,
              symbol: 'MAX-ENERGY',
              decimals: 0,
              rawAmount: '0',
              uiAmount: '0',
              iconUrl: '',
            },
            {
              assetType: KnownCaip19Id.MaximumBandwidthMainnet,
              keyringAccountId: mockAccount.id,
              network: Network.Mainnet,
              symbol: 'MAX-BANDWIDTH',
              decimals: 0,
              rawAmount: '0',
              uiAmount: '0',
              iconUrl: '',
            },
          ];

          mockState.getKey.mockResolvedValue(assets);

          await assetsService.saveMany(assets);

          expect(mockAssetsRepository.saveMany).toHaveBeenCalledWith(assets);
          expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
            expect.anything(),
            KeyringEvent.AccountAssetListUpdated,
            {
              assets: {
                [mockAccount.id]: {
                  added: expect.arrayContaining([
                    KnownCaip19Id.MaximumEnergyMainnet,
                    KnownCaip19Id.MaximumBandwidthMainnet,
                  ]),
                  removed: [],
                },
              },
            },
          );
        },
      );
    });

    it('keeps staked assets even with zero amounts', async () => {
      await withAssetsService(
        async ({ assetsService, mockState, mockAssetsRepository }) => {
          const assets: AssetEntity[] = [
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
              assetType: KnownCaip19Id.TrxStakedForBandwidthMainnet,
              keyringAccountId: mockAccount.id,
              network: Network.Mainnet,
              symbol: 'sTRX-BANDWIDTH',
              decimals: 6,
              rawAmount: '0',
              uiAmount: '0',
              iconUrl: '',
            },
            {
              assetType: KnownCaip19Id.TrxStakedForEnergyMainnet,
              keyringAccountId: mockAccount.id,
              network: Network.Mainnet,
              symbol: 'sTRX-ENERGY',
              decimals: 6,
              rawAmount: '0',
              uiAmount: '0',
              iconUrl: '',
            },
          ];

          mockState.getKey.mockResolvedValue(assets);

          await assetsService.saveMany(assets);

          expect(mockAssetsRepository.saveMany).toHaveBeenCalledWith(assets);
          expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
            expect.anything(),
            KeyringEvent.AccountAssetListUpdated,
            {
              assets: {
                [mockAccount.id]: {
                  added: expect.arrayContaining([
                    KnownCaip19Id.TrxStakedForBandwidthMainnet,
                    KnownCaip19Id.TrxStakedForEnergyMainnet,
                  ]),
                  removed: [],
                },
              },
            },
          );
        },
      );
    });

    it('keeps ready for withdrawal assets even with zero amounts', async () => {
      await withAssetsService(
        async ({ assetsService, mockState, mockAssetsRepository }) => {
          const assets: AssetEntity[] = [
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
              assetType: KnownCaip19Id.TrxReadyForWithdrawalMainnet,
              keyringAccountId: mockAccount.id,
              network: Network.Mainnet,
              symbol: 'trx-ready-for-withdrawal',
              decimals: 6,
              rawAmount: '0',
              uiAmount: '0',
              iconUrl: '',
            },
          ];

          mockState.getKey.mockResolvedValue(assets);

          await assetsService.saveMany(assets);

          expect(mockAssetsRepository.saveMany).toHaveBeenCalledWith(assets);
          expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
            expect.anything(),
            KeyringEvent.AccountAssetListUpdated,
            {
              assets: {
                [mockAccount.id]: {
                  added: expect.arrayContaining([
                    KnownCaip19Id.TrxReadyForWithdrawalMainnet,
                  ]),
                  removed: [],
                },
              },
            },
          );
        },
      );
    });

    describe('updating assets from 0 to >0', () => {
      it('adds energy to the asset list when it updates from 0 to >0', async () => {
        await withAssetsService(
          async ({ assetsService, mockState, mockAssetsRepository }) => {
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

            const updatedAssets: AssetEntity[] = [
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
                assetType: KnownCaip19Id.EnergyMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'ENERGY',
                decimals: 0,
                rawAmount: '50000',
                uiAmount: '50000',
                iconUrl: '',
              },
            ];

            mockState.getKey.mockResolvedValue({
              [mockAccount.id]: savedAssets,
            });

            await assetsService.saveMany(updatedAssets);

            expect(mockAssetsRepository.saveMany).toHaveBeenCalledWith(
              updatedAssets,
            );
            expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
              expect.anything(),
              KeyringEvent.AccountAssetListUpdated,
              {
                assets: {
                  [mockAccount.id]: {
                    added: expect.arrayContaining([
                      KnownCaip19Id.EnergyMainnet,
                    ]),
                    removed: [],
                  },
                },
              },
            );
          },
        );
      });

      it('adds bandwidth to the asset list when it updates from 0 to >0', async () => {
        await withAssetsService(
          async ({ assetsService, mockState, mockAssetsRepository }) => {
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
                assetType: KnownCaip19Id.BandwidthMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'BANDWIDTH',
                decimals: 0,
                rawAmount: '0',
                uiAmount: '0',
                iconUrl: '',
              },
            ];

            const updatedAssets: AssetEntity[] = [
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
                assetType: KnownCaip19Id.BandwidthMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'BANDWIDTH',
                decimals: 0,
                rawAmount: '1500',
                uiAmount: '1500',
                iconUrl: '',
              },
            ];

            mockState.getKey.mockResolvedValue({
              [mockAccount.id]: savedAssets,
            });

            await assetsService.saveMany(updatedAssets);

            expect(mockAssetsRepository.saveMany).toHaveBeenCalledWith(
              updatedAssets,
            );
            expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
              expect.anything(),
              KeyringEvent.AccountAssetListUpdated,
              {
                assets: {
                  [mockAccount.id]: {
                    added: expect.arrayContaining([
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

      it('adds TRC20 token to the asset list when it updates from 0 to >0', async () => {
        await withAssetsService(
          async ({ assetsService, mockState, mockAssetsRepository }) => {
            const trc20AssetId =
              `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` as const;

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
                rawAmount: '0',
                uiAmount: '0',
                iconUrl: '',
              },
            ];

            const updatedAssets: AssetEntity[] = [
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
                rawAmount: '100000000',
                uiAmount: '100',
                iconUrl: '',
              },
            ];

            mockState.getKey.mockResolvedValue({
              [mockAccount.id]: savedAssets,
            });

            await assetsService.saveMany(updatedAssets);

            expect(mockAssetsRepository.saveMany).toHaveBeenCalledWith(
              updatedAssets,
            );
            expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
              expect.anything(),
              KeyringEvent.AccountAssetListUpdated,
              {
                assets: {
                  [mockAccount.id]: {
                    added: expect.arrayContaining([
                      KnownCaip19Id.TrxMainnet,
                      trc20AssetId,
                    ]),
                    removed: [],
                  },
                },
              },
            );
          },
        );
      });

      it('handles multiple assets updating from 0 to >0 simultaneously', async () => {
        await withAssetsService(
          async ({ assetsService, mockState, mockAssetsRepository }) => {
            const trc20AssetId =
              `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` as const;

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
                assetType: KnownCaip19Id.EnergyMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'ENERGY',
                decimals: 0,
                rawAmount: '0',
                uiAmount: '0',
                iconUrl: '',
              },
              {
                assetType: KnownCaip19Id.BandwidthMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'BANDWIDTH',
                decimals: 0,
                rawAmount: '0',
                uiAmount: '0',
                iconUrl: '',
              },
              {
                assetType: trc20AssetId,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'USDT',
                decimals: 6,
                rawAmount: '0',
                uiAmount: '0',
                iconUrl: '',
              },
            ];

            const updatedAssets: AssetEntity[] = [
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
                assetType: KnownCaip19Id.EnergyMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'ENERGY',
                decimals: 0,
                rawAmount: '50000',
                uiAmount: '50000',
                iconUrl: '',
              },
              {
                assetType: KnownCaip19Id.BandwidthMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'BANDWIDTH',
                decimals: 0,
                rawAmount: '1500',
                uiAmount: '1500',
                iconUrl: '',
              },
              {
                assetType: trc20AssetId,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'USDT',
                decimals: 6,
                rawAmount: '100000000',
                uiAmount: '100',
                iconUrl: '',
              },
            ];

            mockState.getKey.mockResolvedValue({
              [mockAccount.id]: savedAssets,
            });

            await assetsService.saveMany(updatedAssets);

            expect(mockAssetsRepository.saveMany).toHaveBeenCalledWith(
              updatedAssets,
            );
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

      it('handles staked assets updating from 0 to >0', async () => {
        await withAssetsService(
          async ({ assetsService, mockState, mockAssetsRepository }) => {
            const savedAssets: AssetEntity[] = [
              {
                assetType: KnownCaip19Id.TrxMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'TRX',
                decimals: 6,
                rawAmount: '5000000',
                uiAmount: '5',
                iconUrl: '',
              },
              {
                assetType: KnownCaip19Id.TrxStakedForEnergyMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'sTRX-ENERGY',
                decimals: 6,
                rawAmount: '0',
                uiAmount: '0',
                iconUrl: '',
              },
            ];

            const updatedAssets: AssetEntity[] = [
              {
                assetType: KnownCaip19Id.TrxMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'TRX',
                decimals: 6,
                rawAmount: '2000000',
                uiAmount: '2',
                iconUrl: '',
              },
              {
                assetType: KnownCaip19Id.TrxStakedForEnergyMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'sTRX-ENERGY',
                decimals: 6,
                rawAmount: '3000000',
                uiAmount: '3',
                iconUrl: '',
              },
            ];

            mockState.getKey.mockResolvedValue({
              [mockAccount.id]: savedAssets,
            });

            await assetsService.saveMany(updatedAssets);

            expect(mockAssetsRepository.saveMany).toHaveBeenCalledWith(
              updatedAssets,
            );
            expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
              expect.anything(),
              KeyringEvent.AccountAssetListUpdated,
              {
                assets: {
                  [mockAccount.id]: {
                    added: expect.arrayContaining([
                      KnownCaip19Id.TrxStakedForEnergyMainnet,
                    ]),
                    removed: [],
                  },
                },
              },
            );
          },
        );
      });
    });

    describe('updating assets going down', () => {
      it('updates energy balance when it decreases but remains >0', async () => {
        await withAssetsService(
          async ({ assetsService, mockState, mockAssetsRepository }) => {
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

            const updatedAssets: AssetEntity[] = [
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
                assetType: KnownCaip19Id.EnergyMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'ENERGY',
                decimals: 0,
                rawAmount: '35000',
                uiAmount: '35000',
                iconUrl: '',
              },
            ];

            mockState.getKey.mockResolvedValue({
              [mockAccount.id]: savedAssets,
            });

            await assetsService.saveMany(updatedAssets);

            expect(mockAssetsRepository.saveMany).toHaveBeenCalledWith(
              updatedAssets,
            );
            expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
              expect.anything(),
              KeyringEvent.AccountAssetListUpdated,
              {
                assets: {
                  [mockAccount.id]: {
                    added: expect.arrayContaining([
                      KnownCaip19Id.TrxMainnet,
                      KnownCaip19Id.EnergyMainnet,
                    ]),
                    removed: [],
                  },
                },
              },
            );

            expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
              expect.anything(),
              KeyringEvent.AccountBalancesUpdated,
              {
                balances: {
                  [mockAccount.id]: {
                    [KnownCaip19Id.TrxMainnet]: {
                      unit: 'TRX',
                      amount: '1',
                    },
                    [KnownCaip19Id.EnergyMainnet]: {
                      unit: 'ENERGY',
                      amount: '35000',
                    },
                  },
                },
              },
            );
          },
        );
      });

      it('updates bandwidth balance when it decreases but remains >0', async () => {
        await withAssetsService(
          async ({ assetsService, mockState, mockAssetsRepository }) => {
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
                assetType: KnownCaip19Id.BandwidthMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'BANDWIDTH',
                decimals: 0,
                rawAmount: '5000',
                uiAmount: '5000',
                iconUrl: '',
              },
            ];

            const updatedAssets: AssetEntity[] = [
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
                assetType: KnownCaip19Id.BandwidthMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'BANDWIDTH',
                decimals: 0,
                rawAmount: '4700',
                uiAmount: '4700',
                iconUrl: '',
              },
            ];

            mockState.getKey.mockResolvedValue({
              [mockAccount.id]: savedAssets,
            });

            await assetsService.saveMany(updatedAssets);

            expect(mockAssetsRepository.saveMany).toHaveBeenCalledWith(
              updatedAssets,
            );
            expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
              expect.anything(),
              KeyringEvent.AccountAssetListUpdated,
              {
                assets: {
                  [mockAccount.id]: {
                    added: expect.arrayContaining([
                      KnownCaip19Id.TrxMainnet,
                      KnownCaip19Id.BandwidthMainnet,
                    ]),
                    removed: [],
                  },
                },
              },
            );

            expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
              expect.anything(),
              KeyringEvent.AccountBalancesUpdated,
              {
                balances: {
                  [mockAccount.id]: {
                    [KnownCaip19Id.TrxMainnet]: {
                      unit: 'TRX',
                      amount: '1',
                    },
                    [KnownCaip19Id.BandwidthMainnet]: {
                      unit: 'BANDWIDTH',
                      amount: '4700',
                    },
                  },
                },
              },
            );
          },
        );
      });

      it('updates TRC20 token balance when it decreases but remains >0', async () => {
        await withAssetsService(
          async ({ assetsService, mockState, mockAssetsRepository }) => {
            const trc20AssetId =
              `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` as const;

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
                rawAmount: '100000000',
                uiAmount: '100',
                iconUrl: '',
              },
            ];

            const updatedAssets: AssetEntity[] = [
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
                rawAmount: '50000000',
                uiAmount: '50',
                iconUrl: '',
              },
            ];

            mockState.getKey.mockResolvedValue({
              [mockAccount.id]: savedAssets,
            });

            await assetsService.saveMany(updatedAssets);

            expect(mockAssetsRepository.saveMany).toHaveBeenCalledWith(
              updatedAssets,
            );
            expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
              expect.anything(),
              KeyringEvent.AccountAssetListUpdated,
              {
                assets: {
                  [mockAccount.id]: {
                    added: expect.arrayContaining([
                      KnownCaip19Id.TrxMainnet,
                      trc20AssetId,
                    ]),
                    removed: [],
                  },
                },
              },
            );
          },
        );
      });

      it('keeps energy in the list when it drops to 0', async () => {
        await withAssetsService(
          async ({ assetsService, mockState, mockAssetsRepository }) => {
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
                assetType: KnownCaip19Id.EnergyMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'ENERGY',
                decimals: 0,
                rawAmount: '50000',
                uiAmount: '50000',
                iconUrl: '',
              },
            ];

            const updatedAssets: AssetEntity[] = [
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

            mockState.getKey.mockResolvedValue({
              [mockAccount.id]: savedAssets,
            });

            await assetsService.saveMany(updatedAssets);

            expect(mockAssetsRepository.saveMany).toHaveBeenCalledWith(
              updatedAssets,
            );
            expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
              expect.anything(),
              KeyringEvent.AccountAssetListUpdated,
              {
                assets: {
                  [mockAccount.id]: {
                    added: expect.arrayContaining([
                      KnownCaip19Id.TrxMainnet,
                      KnownCaip19Id.EnergyMainnet,
                    ]),
                    removed: [],
                  },
                },
              },
            );
          },
        );
      });

      it('keeps bandwidth in the list when it drops to 0', async () => {
        await withAssetsService(
          async ({ assetsService, mockState, mockAssetsRepository }) => {
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
                assetType: KnownCaip19Id.BandwidthMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'BANDWIDTH',
                decimals: 0,
                rawAmount: '300',
                uiAmount: '300',
                iconUrl: '',
              },
            ];

            const updatedAssets: AssetEntity[] = [
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
                assetType: KnownCaip19Id.BandwidthMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'BANDWIDTH',
                decimals: 0,
                rawAmount: '0',
                uiAmount: '0',
                iconUrl: '',
              },
            ];

            mockState.getKey.mockResolvedValue({
              [mockAccount.id]: savedAssets,
            });

            await assetsService.saveMany(updatedAssets);

            expect(mockAssetsRepository.saveMany).toHaveBeenCalledWith(
              updatedAssets,
            );
            expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
              expect.anything(),
              KeyringEvent.AccountAssetListUpdated,
              {
                assets: {
                  [mockAccount.id]: {
                    added: expect.arrayContaining([
                      KnownCaip19Id.TrxMainnet,
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

      it('handles both energy and bandwidth fluctuating in a transaction', async () => {
        await withAssetsService(
          async ({ assetsService, mockState, mockAssetsRepository }) => {
            const savedAssets: AssetEntity[] = [
              {
                assetType: KnownCaip19Id.TrxMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'TRX',
                decimals: 6,
                rawAmount: '2000000',
                uiAmount: '2',
                iconUrl: '',
              },
              {
                assetType: KnownCaip19Id.EnergyMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'ENERGY',
                decimals: 0,
                rawAmount: '80000',
                uiAmount: '80000',
                iconUrl: '',
              },
              {
                assetType: KnownCaip19Id.BandwidthMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'BANDWIDTH',
                decimals: 0,
                rawAmount: '1500',
                uiAmount: '1500',
                iconUrl: '',
              },
            ];

            const updatedAssets: AssetEntity[] = [
              {
                assetType: KnownCaip19Id.TrxMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'TRX',
                decimals: 6,
                rawAmount: '2000000',
                uiAmount: '2',
                iconUrl: '',
              },
              {
                assetType: KnownCaip19Id.EnergyMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'ENERGY',
                decimals: 0,
                rawAmount: '45000',
                uiAmount: '45000',
                iconUrl: '',
              },
              {
                assetType: KnownCaip19Id.BandwidthMainnet,
                keyringAccountId: mockAccount.id,
                network: Network.Mainnet,
                symbol: 'BANDWIDTH',
                decimals: 0,
                rawAmount: '1235',
                uiAmount: '1235',
                iconUrl: '',
              },
            ];

            mockState.getKey.mockResolvedValue({
              [mockAccount.id]: savedAssets,
            });

            await assetsService.saveMany(updatedAssets);

            expect(mockAssetsRepository.saveMany).toHaveBeenCalledWith(
              updatedAssets,
            );
            expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
              expect.anything(),
              KeyringEvent.AccountAssetListUpdated,
              {
                assets: {
                  [mockAccount.id]: {
                    added: expect.arrayContaining([
                      KnownCaip19Id.TrxMainnet,
                      KnownCaip19Id.EnergyMainnet,
                      KnownCaip19Id.BandwidthMainnet,
                    ]),
                    removed: [],
                  },
                },
              },
            );

            expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
              expect.anything(),
              KeyringEvent.AccountBalancesUpdated,
              {
                balances: {
                  [mockAccount.id]: {
                    [KnownCaip19Id.TrxMainnet]: {
                      unit: 'TRX',
                      amount: '2',
                    },
                    [KnownCaip19Id.EnergyMainnet]: {
                      unit: 'ENERGY',
                      amount: '45000',
                    },
                    [KnownCaip19Id.BandwidthMainnet]: {
                      unit: 'BANDWIDTH',
                      amount: '1235',
                    },
                  },
                },
              },
            );
          },
        );
      });
    });
  });

  describe('assets migration', () => {
    const accountId = mockAccount.id;
    const fungibleAssetId = KnownCaip19Id.TrxMainnet;
    const activeMigrationStage =
      SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback;

    it('routes getAccountAssetByID through AssetsController when migration is active', async () => {
      await withAssetsService(async ({ assetsService, mockCoreMessenger }) => {
        mockCoreMessenger.call.mockImplementation(
          createMessengerCallMock(
            () => ({
              remoteFeatureFlags: {
                [TRON_FLAG_KEY]: {
                  stage: activeMigrationStage,
                },
              },
            }),
            jest.fn().mockResolvedValue(
              buildControllerAsset(fungibleAssetId, '2', {
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

    it('routes getAccountAssetsByIDs through AssetsController when migration is active', async () => {
      await withAssetsService(async ({ assetsService, mockCoreMessenger }) => {
        const trx = KnownCaip19Id.TrxMainnet;
        const usdt = `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;

        mockCoreMessenger.call.mockImplementation(
          createMessengerCallMock(
            () => ({
              remoteFeatureFlags: {
                [TRON_FLAG_KEY]: {
                  stage: activeMigrationStage,
                },
              },
            }),
            jest.fn(),
            jest.fn().mockImplementation(async () => {
              return {
                [trx as Caip19AssetId]: buildControllerAsset(trx, '1', {
                  symbol: 'TRX',
                  name: 'TRON',
                  decimals: 6,
                }),
                [usdt as Caip19AssetId]: buildControllerAsset(usdt, '0.5', {
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

    it('routes getAccountAssets through AssetsController when migration is active', async () => {
      await withAssetsService(
        async ({ assetsService, mockCoreMessenger, setMigrationStage }) => {
          setMigrationStage(activeMigrationStage);

          mockCoreMessenger.call.mockImplementation(
            createMessengerCallMock(
              () => ({
                remoteFeatureFlags: {
                  [TRON_FLAG_KEY]: {
                    stage: activeMigrationStage,
                  },
                },
              }),
              jest.fn(),
              jest.fn(),
              jest.fn().mockResolvedValue({
                [fungibleAssetId as Caip19AssetId]: buildControllerAsset(
                  fungibleAssetId,
                  '2',
                  {
                    symbol: 'TRX',
                    name: 'TRON',
                    decimals: 6,
                  },
                ),
              }),
            ),
          );

          const assets = await assetsService.getAccountAssets(accountId);

          expect(mockCoreMessenger.call).toHaveBeenCalledWith(
            'AssetsController:getAccountAssetsByScope',
            accountId,
            Network.Mainnet,
          );
          expect(mockCoreMessenger.call).toHaveBeenCalledWith(
            'AssetsController:getAccountAssetsByScope',
            accountId,
            Network.Nile,
          );
          expect(mockCoreMessenger.call).toHaveBeenCalledWith(
            'AssetsController:getAccountAssetsByScope',
            accountId,
            Network.Shasta,
          );
          expect(
            assets.some(
              (asset: AssetEntity) => asset.assetType === fungibleAssetId,
            ),
          ).toBe(true);
        },
      );
    });

    it('emits only snap-owned assets and does not persist when migration is active', async () => {
      await withAssetsService(
        async ({ assetsService, mockAssetsRepository, setMigrationStage }) => {
          setMigrationStage(activeMigrationStage);

          const specialAsset: AssetEntity = {
            assetType: KnownCaip19Id.BandwidthMainnet,
            keyringAccountId: mockAccount.id,
            network: Network.Mainnet,
            symbol: 'BANDWIDTH',
            decimals: 0,
            rawAmount: '600',
            uiAmount: '600',
            iconUrl: '',
          };
          const fungibleAsset: AssetEntity = {
            assetType: KnownCaip19Id.TrxMainnet,
            keyringAccountId: mockAccount.id,
            network: Network.Mainnet,
            symbol: 'TRX',
            decimals: 6,
            rawAmount: '1000000',
            uiAmount: '1',
            iconUrl: '',
          };

          await assetsService.saveMany([specialAsset, fungibleAsset]);

          expect(mockAssetsRepository.saveMany).not.toHaveBeenCalled();
          expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
            expect.anything(),
            KeyringEvent.AccountAssetListUpdated,
            {
              assets: {
                [mockAccount.id]: {
                  added: [KnownCaip19Id.BandwidthMainnet],
                  removed: [],
                },
              },
            },
          );
          expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
            expect.anything(),
            KeyringEvent.AccountBalancesUpdated,
            {
              balances: {
                [mockAccount.id]: {
                  [KnownCaip19Id.BandwidthMainnet]: {
                    unit: 'BANDWIDTH',
                    amount: '600',
                  },
                },
              },
            },
          );
        },
      );
    });
  });

  describe('facade delegation', () => {
    it('delegates empty batch reads to SnapAssetsAdapter', async () => {
      await withAssetsService(
        async ({ assetsService, mockAssetsRepository }) => {
          const asset: AssetEntity = {
            iconUrl: '',
            assetType: KnownCaip19Id.TrxMainnet,
            keyringAccountId: mockAccount.id,
            network: Network.Mainnet,
            symbol: 'TRX',
            decimals: 6,
            rawAmount: '1',
            uiAmount: '1',
          };

          mockAssetsRepository.getByAccountIdAndAssetTypes.mockResolvedValue([
            asset,
          ]);

          expect(
            await assetsService.getAccountAssetsByIDs(mockAccount.id, []),
          ).toStrictEqual([]);
        },
      );
    });
  });

  describe('getFreshAccountAssetsByIDs', () => {
    it('returns an empty array when no asset IDs are requested', async () => {
      await withAssetsService(
        async ({ assetsService, mockTrongridApiClient }) => {
          expect(
            await assetsService.getFreshAccountAssetsByIDs(mockAccount, []),
          ).toStrictEqual([]);
          expect(
            mockTrongridApiClient.getAccountInfoByAddress,
          ).not.toHaveBeenCalled();
        },
      );
    });

    it('syncs, saves, and reads fresh values when migration is off', async () => {
      await withAssetsService(
        async ({
          assetsService,
          mockTrongridApiClient,
          mockTronHttpClient,
          mockAssetsRepository,
        }) => {
          mockTrongridApiClient.getAccountInfoByAddress.mockRejectedValue(
            new TrongridAccountNotFoundError(),
          );
          mockTronHttpClient.getAccountResources.mockResolvedValue(
            emptyAccountResources,
          );
          mockTronHttpClient.getReward.mockResolvedValue(0);
          mockTrongridApiClient.getTrc20BalancesByAddress.mockResolvedValue([]);

          const asset: AssetEntity = {
            iconUrl: '',
            assetType: KnownCaip19Id.TrxMainnet,
            keyringAccountId: mockAccount.id,
            network: Network.Mainnet,
            symbol: 'TRX',
            decimals: 6,
            rawAmount: '1000000',
            uiAmount: '1',
          };
          mockAssetsRepository.getByAccountIdAndAssetTypes.mockResolvedValue([
            asset,
          ]);

          const results = await assetsService.getFreshAccountAssetsByIDs(
            mockAccount,
            [KnownCaip19Id.TrxMainnet],
          );

          expect(mockAssetsRepository.saveMany).toHaveBeenCalled();
          expect(results[0]).toStrictEqual(asset);
        },
      );
    });

    it('routes through the Core adapter when migration is active', async () => {
      const activeMigrationStage =
        SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback;

      await withAssetsService(
        async ({
          assetsService,
          mockCoreMessenger,
          mockTrongridApiClient,
          setMigrationStage,
        }) => {
          setMigrationStage(activeMigrationStage);

          mockTrongridApiClient.getAccountInfoByAddress.mockRejectedValue(
            new TrongridAccountNotFoundError(),
          );
          mockTrongridApiClient.getTrc20BalancesByAddress.mockResolvedValue(
            [],
          );

          const trx = KnownCaip19Id.TrxMainnet as Caip19AssetId;
          mockCoreMessenger.call.mockImplementation(
            createMessengerCallMock(
              () => ({
                remoteFeatureFlags: {
                  [TRON_FLAG_KEY]: { stage: activeMigrationStage },
                },
              }),
              jest.fn(),
              jest.fn(),
              jest.fn(),
              jest.fn().mockResolvedValue({
                'test-account-id': {
                  [trx]: buildControllerAsset(trx, '1', {
                    symbol: 'TRX',
                    name: 'TRON',
                    decimals: 6,
                  }),
                },
              }),
            ),
          );

          const results = await assetsService.getFreshAccountAssetsByIDs(
            mockAccount,
            [trx],
          );

          expect(mockCoreMessenger.call).toHaveBeenCalledWith(
            'AssetsController:getAssets',
            expect.anything(),
            {
              chainIds: [Network.Mainnet],
              forceUpdate: true,
              bypassServerCache: true,
            },
          );
          expect(results[0]?.rawAmount).toBe('1000000');
        },
      );
    });
  });

  describe('getFreshAccountAssetByID', () => {
    it('returns the single fresh asset', async () => {
      await withAssetsService(
        async ({
          assetsService,
          mockTrongridApiClient,
          mockTronHttpClient,
          mockAssetsRepository,
        }) => {
          mockTrongridApiClient.getAccountInfoByAddress.mockRejectedValue(
            new TrongridAccountNotFoundError(),
          );
          mockTronHttpClient.getAccountResources.mockResolvedValue(
            emptyAccountResources,
          );
          mockTronHttpClient.getReward.mockResolvedValue(0);
          mockTrongridApiClient.getTrc20BalancesByAddress.mockResolvedValue([]);

          const asset: AssetEntity = {
            iconUrl: '',
            assetType: KnownCaip19Id.TrxMainnet,
            keyringAccountId: mockAccount.id,
            network: Network.Mainnet,
            symbol: 'TRX',
            decimals: 6,
            rawAmount: '1000000',
            uiAmount: '1',
          };
          mockAssetsRepository.getByAccountIdAndAssetTypes.mockResolvedValue([
            asset,
          ]);

          const result = await assetsService.getFreshAccountAssetByID(
            mockAccount,
            KnownCaip19Id.TrxMainnet,
          );

          expect(result).toStrictEqual(asset);
        },
      );
    });
  });
});
