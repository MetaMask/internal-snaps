import type { KeyringAccount } from '@metamask/keyring-api';
import { KeyringEvent } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';

import type { AssetsRepository } from './AssetsRepository';
import type { PriceApiClient } from '../../clients/price-api/PriceApiClient';
import type { SpotPrices } from '../../clients/price-api/types';
import type { TokenApiClient } from '../../clients/token-api/TokenApiClient';
import type { AccountResources } from '../../clients/tron-http/structs';
import type { TronHttpClient } from '../../clients/tron-http/TronHttpClient';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import type { Trc20Balance, TronAccount } from '../../clients/trongrid/types';
import { KnownCaip19Id, Network } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import { mockLogger } from '../../utils/mockLogger';
import type { State, UnencryptedStateValue } from '../state/State';

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

// eslint-disable-next-line no-restricted-globals
(global as any).snap = {};

// eslint-disable-next-line @typescript-eslint/no-require-imports, no-restricted-globals
const { AssetsService } = require('./AssetsService');

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
/* eslint-disable @typescript-eslint/naming-convention */
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
/* eslint-enable @typescript-eslint/naming-convention */

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
      | 'getByAccountId'
      | 'getByAccountIdAndAssetType'
      | 'getByAccountIdAndAssetTypes'
    >
  >;
  mockState: jest.Mocked<
    Pick<State<UnencryptedStateValue>, 'getKey' | 'setKey'>
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

  const mockState: jest.Mocked<
    Pick<State<UnencryptedStateValue>, 'getKey' | 'setKey'>
  > = {
    getKey: jest.fn().mockResolvedValue({}),
    setKey: jest.fn().mockResolvedValue(undefined),
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

  const assetsService = new AssetsService({
    logger: mockLogger,
    assetsRepository: mockAssetsRepository,
    state: mockState,
    trongridApiClient: mockTrongridApiClient,
    tronHttpClient: mockTronHttpClient,
    priceApiClient: mockPriceApiClient,
    tokenApiClient: mockTokenApiClient,
  });

  return await testFunction({
    assetsService,
    mockAssetsRepository,
    mockState,
    mockTrongridApiClient,
    mockTronHttpClient,
    mockPriceApiClient,
    mockTokenApiClient,
  });
}

describe('AssetsService', () => {
  describe('fetchAssetsAndBalancesForAccount', () => {
    describe('inactive account fallback', () => {
      it('falls back to TRC20 balance endpoint when account info fails (inactive account)', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockTrongridApiClient,
            mockTronHttpClient,
            mockPriceApiClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockRejectedValue(
              new Error('Account not found or no data returned'),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              emptyAccountResources,
            );

            const trc20Balances = [
              { TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: '24249143' },
            ];
            mockTrongridApiClient.getTrc20BalancesByAddress.mockResolvedValue(
              trc20Balances,
            );

            const trc20AssetId = `${String(Network.Mainnet)}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;
            mockPriceApiClient.getMultipleSpotPrices.mockResolvedValue(
              createSpotPrices({
                [trc20AssetId]: { id: trc20AssetId, price: 1.0 },
              }),
            );

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
            );

            expect(
              mockTrongridApiClient.getTrc20BalancesByAddress,
            ).toHaveBeenCalledWith(Network.Mainnet, mockAccount.address);

            const trxAsset = assets.find(
              (asset: AssetEntity) =>
                asset.assetType === KnownCaip19Id.TrxMainnet,
            );
            expect(trxAsset).toBeDefined();
            expect(trxAsset?.rawAmount).toBe('0');

            const expectedTrc20AssetType = `${String(Network.Mainnet)}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;
            const trc20Asset = assets.find(
              (asset: AssetEntity) =>
                // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
                asset.assetType === expectedTrc20AssetType,
            );
            expect(trc20Asset).toBeDefined();
            expect(trc20Asset?.rawAmount).toBe('24249143');
          },
        );
      });

      it('returns zero TRX and resources when fallback also returns empty', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockRejectedValue(
              new Error('Account not found or no data returned'),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              emptyAccountResources,
            );
            mockTrongridApiClient.getTrc20BalancesByAddress.mockResolvedValue(
              [],
            );

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
            );

            expect(
              mockTrongridApiClient.getTrc20BalancesByAddress,
            ).toHaveBeenCalledWith(Network.Mainnet, mockAccount.address);

            const trxAsset = assets.find(
              (asset: AssetEntity) =>
                asset.assetType === KnownCaip19Id.TrxMainnet,
            );
            expect(trxAsset).toBeDefined();
            expect(trxAsset?.rawAmount).toBe('0');

            const bandwidthAsset = assets.find(
              (asset: AssetEntity) =>
                asset.assetType === KnownCaip19Id.BandwidthMainnet,
            );
            const energyAsset = assets.find(
              (asset: AssetEntity) =>
                asset.assetType === KnownCaip19Id.EnergyMainnet,
            );
            expect(bandwidthAsset).toBeDefined();
            expect(energyAsset).toBeDefined();
          },
        );
      });

      it('gracefully handles fallback endpoint failure', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockRejectedValue(
              new Error('Account not found or no data returned'),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              emptyAccountResources,
            );
            mockTrongridApiClient.getTrc20BalancesByAddress.mockRejectedValue(
              new Error('Network error'),
            );

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
            );

            const trxAsset = assets.find(
              (asset: AssetEntity) =>
                asset.assetType === KnownCaip19Id.TrxMainnet,
            );
            expect(trxAsset).toBeDefined();
            expect(trxAsset?.rawAmount).toBe('0');
          },
        );
      });

      it('filters out TRC20 tokens without price data from inactive account', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockTrongridApiClient,
            mockTronHttpClient,
            mockPriceApiClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockRejectedValue(
              new Error('Account not found or no data returned'),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              emptyAccountResources,
            );

            const trc20BalancesWithSpam: Trc20Balance[] = [
              { TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: '24249143' }, // USDT - has price
              { TSpamToken123456789: '1000000000' }, // Spam token - no price
            ];
            mockTrongridApiClient.getTrc20BalancesByAddress.mockResolvedValue(
              trc20BalancesWithSpam,
            );

            const usdtAssetId = `${String(Network.Mainnet)}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;
            mockPriceApiClient.getMultipleSpotPrices.mockResolvedValue(
              createSpotPrices({
                [usdtAssetId]: { id: usdtAssetId, price: 1.0 },
              }),
            );

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
            );

            const usdtAssetType = `${String(Network.Mainnet)}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;
            const usdtAsset = assets.find(
              // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
              (asset: AssetEntity) => asset.assetType === usdtAssetType,
            );
            expect(usdtAsset).toBeDefined();

            const spamAssetType = `${String(Network.Mainnet)}/trc20:TSpamToken123456789`;
            const spamAsset = assets.find(
              // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
              (asset: AssetEntity) => asset.assetType === spamAssetType,
            );
            expect(spamAsset).toBeUndefined();
          },
        );
      });
    });

    describe('partial failure handling', () => {
      it('uses fallback when account info fails even if resources succeed (inactive account)', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockTrongridApiClient,
            mockTronHttpClient,
            mockPriceApiClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockRejectedValue(
              new Error('Account not found or no data returned'),
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({
              ...emptyAccountResources,
              freeNetLimit: 600,
              NetLimit: 0,
              EnergyLimit: 0,
            });

            const trc20Balances = [
              { TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: '100000' },
            ];
            mockTrongridApiClient.getTrc20BalancesByAddress.mockResolvedValue(
              trc20Balances,
            );

            const trc20AssetId = `${String(Network.Mainnet)}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;
            mockPriceApiClient.getMultipleSpotPrices.mockResolvedValue(
              createSpotPrices({
                [trc20AssetId]: { id: trc20AssetId, price: 1.0 },
              }),
            );

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
            );

            expect(
              mockTrongridApiClient.getTrc20BalancesByAddress,
            ).toHaveBeenCalledWith(Network.Mainnet, mockAccount.address);

            const trxAsset = assets.find(
              (asset: AssetEntity) =>
                asset.assetType === KnownCaip19Id.TrxMainnet,
            );
            expect(trxAsset).toBeDefined();
            expect(trxAsset?.rawAmount).toBe('0');

            const trc20Asset = assets.find(
              // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
              (asset: AssetEntity) => asset.assetType === trc20AssetId,
            );
            expect(trc20Asset).toBeDefined();
            expect(trc20Asset?.rawAmount).toBe('100000');
          },
        );
      });

      it('continues with zero resources when only resources request fails', async () => {
        await withAssetsService(
          async ({
            assetsService,
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

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
            );

            const trxAsset = assets.find(
              (asset: AssetEntity) =>
                asset.assetType === KnownCaip19Id.TrxMainnet,
            );
            expect(trxAsset).toBeDefined();
            expect(trxAsset?.rawAmount).toBe('1000000');

            const bandwidthAsset = assets.find(
              (asset: AssetEntity) =>
                asset.assetType === KnownCaip19Id.BandwidthMainnet,
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
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({ freeNetUsed: 200 }),
            );

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({ freeNetUsed: 326, NetLimit: 16 }),
            );

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({}),
            );

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({ NetLimit: 48 }),
            );

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
            );

            expect(
              findAsset(assets, KnownCaip19Id.MaximumBandwidthMainnet)
                ?.rawAmount,
            ).toBe('648');
          },
        );
      });
    });

    /* eslint-disable @typescript-eslint/naming-convention */
    describe('TRX ready for withdrawal', () => {
      it('returns undefined when account has no unfrozenV2 data', async () => {
        await withAssetsService(
          async ({
            assetsService,
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

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
            );

            const readyForWithdrawalAsset = findAsset(
              assets,
              KnownCaip19Id.TrxReadyForWithdrawalMainnet,
            );
            expect(readyForWithdrawalAsset).toBeUndefined();
          },
        );
      });

      it('returns ready for withdrawal amount when unfrozenV2 has expired entries', async () => {
        await withAssetsService(
          async ({
            assetsService,
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

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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

      it('does not return asset when unfrozenV2 has not expired', async () => {
        await withAssetsService(
          async ({
            assetsService,
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

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
            );

            const readyForWithdrawalAsset = findAsset(
              assets,
              KnownCaip19Id.TrxReadyForWithdrawalMainnet,
            );
            expect(readyForWithdrawalAsset).toBeUndefined();
          },
        );
      });

      it('sums multiple expired unfrozen entries', async () => {
        await withAssetsService(
          async ({
            assetsService,
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

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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
    /* eslint-enable @typescript-eslint/naming-convention */

    /* eslint-disable @typescript-eslint/naming-convention */
    describe('TRX in lock period', () => {
      it('returns undefined when account has no unfrozenV2 data', async () => {
        await withAssetsService(
          async ({
            assetsService,
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

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
            );

            const inLockPeriodAsset = findAsset(
              assets,
              KnownCaip19Id.TrxInLockPeriodMainnet,
            );
            expect(inLockPeriodAsset).toBeUndefined();
          },
        );
      });

      it('returns in lock period amount when unfrozenV2 has future entries', async () => {
        await withAssetsService(
          async ({
            assetsService,
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

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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

      it('does not return asset when unfrozenV2 has already expired', async () => {
        await withAssetsService(
          async ({
            assetsService,
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

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
            );

            const inLockPeriodAsset = findAsset(
              assets,
              KnownCaip19Id.TrxInLockPeriodMainnet,
            );
            expect(inLockPeriodAsset).toBeUndefined();
          },
        );
      });

      it('sums multiple non-expired unfrozen entries', async () => {
        await withAssetsService(
          async ({
            assetsService,
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

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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

      it('returns undefined for inactive accounts', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockRejectedValue(
              new Error('account not found'),
            );
            mockTrongridApiClient.getTrc20BalancesByAddress.mockResolvedValue(
              [],
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
            );

            const inLockPeriodAsset = findAsset(
              assets,
              KnownCaip19Id.TrxInLockPeriodMainnet,
            );
            expect(inLockPeriodAsset).toBeUndefined();
          },
        );
      });
    });
    /* eslint-enable @typescript-eslint/naming-convention */

    describe('energy', () => {
      it('returns 0 when account has no resources', async () => {
        await withAssetsService(
          async ({
            assetsService,
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({ EnergyLimit: 329 }),
            );

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({ EnergyLimit: 5000, EnergyUsed: 4383 }),
            );

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({ EnergyLimit: 46, EnergyUsed: 6511 }),
            );

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue(
              getMockAccountResources({ EnergyLimit: 329 }),
            );

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});
            mockTronHttpClient.getReward.mockResolvedValue(0);

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
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
            mockTrongridApiClient,
            mockTronHttpClient,
          }) => {
            mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue(
              minimalTronAccount,
            );
            mockTronHttpClient.getAccountResources.mockResolvedValue({});
            mockTronHttpClient.getReward.mockResolvedValue(5000000);

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
            );

            const stakingRewardsAsset = findAsset(
              assets,
              KnownCaip19Id.TrxStakingRewardsMainnet,
            );
            expect(stakingRewardsAsset?.rawAmount).toBe('5000000');
            expect(stakingRewardsAsset?.uiAmount).toBe('5');
            expect(stakingRewardsAsset?.symbol).toBe('srTRX');
          },
        );
      });

      it('gracefully handles staking rewards API failure', async () => {
        await withAssetsService(
          async ({
            assetsService,
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

            const assets = await assetsService.fetchAssetsAndBalancesForAccount(
              Network.Mainnet,
              mockAccount,
            );

            expect(
              findAsset(assets, KnownCaip19Id.TrxStakingRewardsMainnet)
                ?.rawAmount,
            ).toBe('0');
          },
        );
      });
    });
  });

  describe('saveMany', () => {
    it('does not remove energy and bandwidth assets even when they have zero amounts', async () => {
      await withAssetsService(async ({ assetsService, mockState }) => {
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

        mockState.getKey.mockResolvedValue({});

        await assetsService.saveMany(assets);

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
      });
    });

    it('removes non-essential assets with zero amounts', async () => {
      await withAssetsService(async ({ assetsService, mockState }) => {
        const trc20AssetId = `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;
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

    it('keeps maximum energy and bandwidth assets even with zero amounts', async () => {
      await withAssetsService(async ({ assetsService, mockState }) => {
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

        mockState.getKey.mockResolvedValue({});

        await assetsService.saveMany(assets);

        expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
          expect.anything(),
          KeyringEvent.AccountAssetListUpdated,
          {
            assets: {
              [mockAccount.id]: {
                added: expect.arrayContaining([
                  KnownCaip19Id.TrxMainnet,
                  KnownCaip19Id.MaximumEnergyMainnet,
                  KnownCaip19Id.MaximumBandwidthMainnet,
                ]),
                removed: [],
              },
            },
          },
        );
      });
    });

    it('keeps staked assets even with zero amounts', async () => {
      await withAssetsService(async ({ assetsService, mockState }) => {
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

        mockState.getKey.mockResolvedValue({});

        await assetsService.saveMany(assets);

        expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
          expect.anything(),
          KeyringEvent.AccountAssetListUpdated,
          {
            assets: {
              [mockAccount.id]: {
                added: expect.arrayContaining([
                  KnownCaip19Id.TrxMainnet,
                  KnownCaip19Id.TrxStakedForBandwidthMainnet,
                  KnownCaip19Id.TrxStakedForEnergyMainnet,
                ]),
                removed: [],
              },
            },
          },
        );
      });
    });

    it('keeps ready for withdrawal assets even with zero amounts', async () => {
      await withAssetsService(async ({ assetsService, mockState }) => {
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
            symbol: 'rfwTRX',
            decimals: 6,
            rawAmount: '0',
            uiAmount: '0',
            iconUrl: '',
          },
        ];

        mockState.getKey.mockResolvedValue({});

        await assetsService.saveMany(assets);

        expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
          expect.anything(),
          KeyringEvent.AccountAssetListUpdated,
          {
            assets: {
              [mockAccount.id]: {
                added: expect.arrayContaining([
                  KnownCaip19Id.TrxMainnet,
                  KnownCaip19Id.TrxReadyForWithdrawalMainnet,
                ]),
                removed: [],
              },
            },
          },
        );
      });
    });

    describe('updating assets from 0 to >0', () => {
      it('adds energy to the asset list when it updates from 0 to >0', async () => {
        await withAssetsService(async ({ assetsService, mockState }) => {
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
        });
      });

      it('adds bandwidth to the asset list when it updates from 0 to >0', async () => {
        await withAssetsService(async ({ assetsService, mockState }) => {
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
        });
      });

      it('adds TRC20 token to the asset list when it updates from 0 to >0', async () => {
        await withAssetsService(async ({ assetsService, mockState }) => {
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
        });
      });

      it('handles multiple assets updating from 0 to >0 simultaneously', async () => {
        await withAssetsService(async ({ assetsService, mockState }) => {
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
                    trc20AssetId,
                  ]),
                  removed: [],
                },
              },
            },
          );
        });
      });

      it('handles staked assets updating from 0 to >0', async () => {
        await withAssetsService(async ({ assetsService, mockState }) => {
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

          expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
            expect.anything(),
            KeyringEvent.AccountAssetListUpdated,
            {
              assets: {
                [mockAccount.id]: {
                  added: expect.arrayContaining([
                    KnownCaip19Id.TrxMainnet,
                    KnownCaip19Id.TrxStakedForEnergyMainnet,
                  ]),
                  removed: [],
                },
              },
            },
          );
        });
      });
    });

    describe('updating assets going down', () => {
      it('updates energy balance when it decreases but remains >0', async () => {
        await withAssetsService(async ({ assetsService, mockState }) => {
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
        });
      });

      it('updates bandwidth balance when it decreases but remains >0', async () => {
        await withAssetsService(async ({ assetsService, mockState }) => {
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
        });
      });

      it('keeps energy in the list when it drops to 0', async () => {
        await withAssetsService(async ({ assetsService, mockState }) => {
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
        });
      });

      it('keeps bandwidth in the list when it drops to 0', async () => {
        await withAssetsService(async ({ assetsService, mockState }) => {
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
        });
      });

      it('handles both energy and bandwidth fluctuating in a transaction', async () => {
        await withAssetsService(async ({ assetsService, mockState }) => {
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
        });
      });
    });
  });
});
