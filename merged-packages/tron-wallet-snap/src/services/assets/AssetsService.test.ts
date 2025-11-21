/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-restricted-globals */
import type { KeyringAccount } from '@metamask/keyring-api';
import { KeyringEvent } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';

import type { AssetsRepository } from './AssetsRepository';
import type { PriceApiClient } from '../../clients/price-api/PriceApiClient';
import type { TokenApiClient } from '../../clients/token-api/TokenApiClient';
import type { TronHttpClient } from '../../clients/tron-http/TronHttpClient';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import { KnownCaip19Id, Network } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import { mockLogger } from '../../utils/mockLogger';
import type { State, UnencryptedStateValue } from '../state/State';

// Mock context module to avoid circular dependency
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

// Mock global snap object
(global as any).snap = {};

// Import AssetsService after mocking context
const { AssetsService } = require('./AssetsService');

describe('AssetsService', () => {
  let assetsService: any;
  let mockAssetsRepository: jest.Mocked<AssetsRepository>;
  let mockState: jest.Mocked<State<UnencryptedStateValue>>;
  let mockTrongridApiClient: jest.Mocked<TrongridApiClient>;
  let mockTronHttpClient: jest.Mocked<TronHttpClient>;
  let mockPriceApiClient: jest.Mocked<PriceApiClient>;
  let mockTokenApiClient: jest.Mocked<TokenApiClient>;

  const mockAccount: KeyringAccount = {
    id: 'test-account-id',
    address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
    type: 'eip155:eoa',
    options: {},
    methods: [],
    scopes: ['tron:728126428'],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockAssetsRepository = {
      saveMany: jest.fn().mockResolvedValue(undefined),
      getByAccountId: jest.fn().mockResolvedValue([]),
      getByAccountIdAndAssetType: jest.fn().mockResolvedValue(null),
      getByAccountIdAndAssetTypes: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<AssetsRepository>;

    mockState = {
      getKey: jest.fn().mockResolvedValue({}),
      setKey: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<State<UnencryptedStateValue>>;

    mockTrongridApiClient = {} as jest.Mocked<TrongridApiClient>;
    mockTronHttpClient = {} as jest.Mocked<TronHttpClient>;
    mockPriceApiClient = {} as jest.Mocked<PriceApiClient>;
    mockTokenApiClient = {} as jest.Mocked<TokenApiClient>;

    assetsService = new AssetsService({
      logger: mockLogger,
      assetsRepository: mockAssetsRepository,
      state: mockState,
      trongridApiClient: mockTrongridApiClient,
      tronHttpClient: mockTronHttpClient,
      priceApiClient: mockPriceApiClient,
      tokenApiClient: mockTokenApiClient,
    });
  });

  describe('saveMany', () => {
    it('does not remove energy and bandwidth assets even when they have zero amounts', async () => {
      // Arrange: Create assets with zero amounts for energy and bandwidth
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
          rawAmount: '0', // Zero energy
          uiAmount: '0',
          iconUrl: '',
        },
        {
          assetType: KnownCaip19Id.BandwidthMainnet,
          keyringAccountId: mockAccount.id,
          network: Network.Mainnet,
          symbol: 'BANDWIDTH',
          decimals: 0,
          rawAmount: '0', // Zero bandwidth
          uiAmount: '0',
          iconUrl: '',
        },
      ];

      // Mock the getAll method to return empty (simulating first sync)
      mockState.getKey.mockResolvedValue({});

      // Act: Save the assets
      await assetsService.saveMany(assets);

      // Assert: Energy and bandwidth should be in the "added" list, not "removed"
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

    it('removes non-essential assets with zero amounts', async () => {
      // Arrange: Create a regular TRC20 token with zero amount
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
          rawAmount: '0', // Zero balance
          uiAmount: '0',
          iconUrl: '',
        },
      ];

      // Mock the getAll method to return the same assets (simulating they were already saved)
      mockState.getKey.mockResolvedValue({
        [mockAccount.id]: assets,
      });

      // Act: Save the assets
      await assetsService.saveMany(assets);

      // Assert: TRC20 with zero balance should be in the "removed" list
      expect(emitSnapKeyringEvent).toHaveBeenCalledWith(
        expect.anything(),
        KeyringEvent.AccountAssetListUpdated,
        {
          assets: {
            [mockAccount.id]: {
              added: [KnownCaip19Id.TrxMainnet], // TRX is always present
              removed: [trc20AssetId], // Zero balance TRC20 should be removed
            },
          },
        },
      );
    });

    it('keeps maximum energy and bandwidth assets even with zero amounts', async () => {
      // Arrange: Create maximum energy and bandwidth assets with zero amounts
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

      // Mock the getAll method to return empty
      mockState.getKey.mockResolvedValue({});

      // Act: Save the assets
      await assetsService.saveMany(assets);

      // Assert: Maximum energy and bandwidth should be in the "added" list
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

    it('keeps staked assets even with zero amounts', async () => {
      // Arrange: Create staked assets with zero amounts
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

      // Mock the getAll method to return empty
      mockState.getKey.mockResolvedValue({});

      // Act: Save the assets
      await assetsService.saveMany(assets);

      // Assert: Staked assets should be in the "added" list
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

    describe('updating assets from 0 to >0', () => {
      it('adds energy to the asset list when it updates from 0 to >0', async () => {
        // Arrange: Previously saved assets with zero energy
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
            rawAmount: '0', // Previously zero
            uiAmount: '0',
            iconUrl: '',
          },
        ];

        // New assets with non-zero energy
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
            rawAmount: '50000', // Now has energy!
            uiAmount: '50000',
            iconUrl: '',
          },
        ];

        // Mock state to return previously saved assets
        mockState.getKey.mockResolvedValue({
          [mockAccount.id]: savedAssets,
        });

        // Act: Save updated assets
        await assetsService.saveMany(updatedAssets);

        // Assert: Energy should be in the "added" list since it went from 0 to >0
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

      it('adds bandwidth to the asset list when it updates from 0 to >0', async () => {
        // Arrange: Previously saved assets with zero bandwidth
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
            rawAmount: '0', // Previously zero
            uiAmount: '0',
            iconUrl: '',
          },
        ];

        // New assets with non-zero bandwidth
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
            rawAmount: '1500', // Now has bandwidth!
            uiAmount: '1500',
            iconUrl: '',
          },
        ];

        // Mock state to return previously saved assets
        mockState.getKey.mockResolvedValue({
          [mockAccount.id]: savedAssets,
        });

        // Act: Save updated assets
        await assetsService.saveMany(updatedAssets);

        // Assert: Bandwidth should be in the "added" list since it went from 0 to >0
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

      it('adds TRC20 token to the asset list when it updates from 0 to >0', async () => {
        const trc20AssetId = `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;

        // Arrange: Previously saved assets with zero USDT
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
            rawAmount: '0', // Previously zero
            uiAmount: '0',
            iconUrl: '',
          },
        ];

        // New assets with non-zero USDT
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
            rawAmount: '100000000', // Now has USDT!
            uiAmount: '100',
            iconUrl: '',
          },
        ];

        // Mock state to return previously saved assets
        mockState.getKey.mockResolvedValue({
          [mockAccount.id]: savedAssets,
        });

        // Act: Save updated assets
        await assetsService.saveMany(updatedAssets);

        // Assert: USDT should be in the "added" list since it went from 0 to >0
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

      it('handles multiple assets updating from 0 to >0 simultaneously', async () => {
        const trc20AssetId = `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;

        // Arrange: Previously saved assets with all zeros
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

        // New assets with all non-zero amounts
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

        // Mock state to return previously saved assets
        mockState.getKey.mockResolvedValue({
          [mockAccount.id]: savedAssets,
        });

        // Act: Save updated assets
        await assetsService.saveMany(updatedAssets);

        // Assert: All assets should be in the "added" list
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

      it('handles staked assets updating from 0 to >0', async () => {
        // Arrange: Previously saved assets with zero staked amounts
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

        // New assets after staking (TRX reduced, staked asset increased)
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
            rawAmount: '3000000', // User staked 3 TRX
            uiAmount: '3',
            iconUrl: '',
          },
        ];

        // Mock state to return previously saved assets
        mockState.getKey.mockResolvedValue({
          [mockAccount.id]: savedAssets,
        });

        // Act: Save updated assets
        await assetsService.saveMany(updatedAssets);

        // Assert: Staked asset should be in the "added" list
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

    describe('updating assets going down', () => {
      it('updates energy balance when it decreases but remains >0', async () => {
        // Arrange: Previously saved assets with high energy
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
            rawAmount: '100000', // High energy
            uiAmount: '100000',
            iconUrl: '',
          },
        ];

        // New assets with reduced energy (after transaction consumption)
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
            rawAmount: '35000', // Energy consumed by transaction
            uiAmount: '35000',
            iconUrl: '',
          },
        ];

        // Mock state to return previously saved assets
        mockState.getKey.mockResolvedValue({
          [mockAccount.id]: savedAssets,
        });

        // Act: Save updated assets
        await assetsService.saveMany(updatedAssets);

        // Assert: Energy should still be in the "added" list (not removed)
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

        // Assert: Balance update event should be emitted with new amount
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

      it('updates bandwidth balance when it decreases but remains >0', async () => {
        // Arrange: Previously saved assets with high bandwidth
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
            rawAmount: '5000', // High bandwidth
            uiAmount: '5000',
            iconUrl: '',
          },
        ];

        // New assets with reduced bandwidth (after transaction consumption)
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
            rawAmount: '4700', // Bandwidth consumed by transaction
            uiAmount: '4700',
            iconUrl: '',
          },
        ];

        // Mock state to return previously saved assets
        mockState.getKey.mockResolvedValue({
          [mockAccount.id]: savedAssets,
        });

        // Act: Save updated assets
        await assetsService.saveMany(updatedAssets);

        // Assert: Bandwidth should still be in the "added" list (not removed)
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

        // Assert: Balance update event should be emitted with new amount
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

      it('keeps energy in the list when it drops to 0', async () => {
        // Arrange: Previously saved assets with some energy
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

        // New assets with zero energy (fully consumed)
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
            rawAmount: '0', // All energy consumed
            uiAmount: '0',
            iconUrl: '',
          },
        ];

        // Mock state to return previously saved assets
        mockState.getKey.mockResolvedValue({
          [mockAccount.id]: savedAssets,
        });

        // Act: Save updated assets
        await assetsService.saveMany(updatedAssets);

        // Assert: Energy should still be in the "added" list (not removed) because it's an essential asset
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

      it('keeps bandwidth in the list when it drops to 0', async () => {
        // Arrange: Previously saved assets with some bandwidth
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

        // New assets with zero bandwidth (fully consumed)
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
            rawAmount: '0', // All bandwidth consumed
            uiAmount: '0',
            iconUrl: '',
          },
        ];

        // Mock state to return previously saved assets
        mockState.getKey.mockResolvedValue({
          [mockAccount.id]: savedAssets,
        });

        // Act: Save updated assets
        await assetsService.saveMany(updatedAssets);

        // Assert: Bandwidth should still be in the "added" list (not removed) because it's an essential asset
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

      it('handles both energy and bandwidth fluctuating in a transaction', async () => {
        // Arrange: Previously saved assets
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

        // New assets after a TRC20 transaction (both consumed)
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
            rawAmount: '45000', // Consumed by smart contract call
            uiAmount: '45000',
            iconUrl: '',
          },
          {
            assetType: KnownCaip19Id.BandwidthMainnet,
            keyringAccountId: mockAccount.id,
            network: Network.Mainnet,
            symbol: 'BANDWIDTH',
            decimals: 0,
            rawAmount: '1235', // Consumed by transaction size
            uiAmount: '1235',
            iconUrl: '',
          },
        ];

        // Mock state to return previously saved assets
        mockState.getKey.mockResolvedValue({
          [mockAccount.id]: savedAssets,
        });

        // Act: Save updated assets
        await assetsService.saveMany(updatedAssets);

        // Assert: Both should remain in the asset list
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

        // Assert: Balance update event should reflect new amounts
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
