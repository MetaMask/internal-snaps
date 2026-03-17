import { FeeType } from '@metamask/keyring-api';
import { BigNumber } from 'bignumber.js';

import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import { KnownCaip19Id, Network, Networks, ZERO } from '../../constants';
import type { TronKeyringAccount } from '../../entities';
import type { ResourceAsset } from '../../entities/assets';
import { getIconUrlForKnownAsset } from '../../ui/confirmation/utils/getIconUrlForKnownAsset';
import type { AssetsService } from '../assets/AssetsService';
import type { FeeCalculatorService } from '../send/FeeCalculatorService';
import type { ComputeFeeResult } from '../send/types';
import type { State, UnencryptedStateValue } from '../state/State';

jest.mock(
  '../../ui/confirmation/views/ConfirmSignTransaction/ConfirmSignTransaction',
  () => ({
    ConfirmSignTransaction: jest.fn().mockReturnValue('<mock-ui>'),
  }),
);

jest.mock('../../ui/confirmation/views/ConfirmSignMessage/render', () => ({
  render: jest.fn(),
}));

jest.mock('../../ui/confirmation/views/ConfirmSignTransaction/render', () => ({
  render: jest.fn(),
}));

jest.mock(
  '../../ui/confirmation/views/ConfirmTransactionRequest/render',
  () => ({
    render: jest.fn(),
  }),
);

jest.mock('../../ui/confirmation/utils/getIconUrlForKnownAsset', () => ({
  getIconUrlForKnownAsset: jest.fn(() => 'mock-icon-url'),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports, no-restricted-globals
const { ConfirmationHandler } = require('./ConfirmationHandler');

const mockGetIconUrlForKnownAsset = jest.mocked(getIconUrlForKnownAsset);

const TEST_ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';

const mockAccount: TronKeyringAccount = {
  id: TEST_ACCOUNT_ID,
  address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
  type: 'tron:eoa',
  options: {},
  methods: [],
  scopes: ['tron:728126428'],
  entropySource: 'test-entropy',
  derivationPath: "m/44'/195'/0'/0/0",
  index: 0,
};

const defaultFees: ComputeFeeResult = [
  {
    type: FeeType.Base,
    asset: {
      unit: 'TRX',
      type: `${Network.Mainnet}/slip44:195`,
      amount: '1000000',
      fungible: true,
    },
  },
];

type WithConfirmationHandlerCallback<ReturnValue> = (payload: {
  handler: InstanceType<typeof ConfirmationHandler>;
  mockSnapClient: jest.Mocked<
    Pick<SnapClient, 'getPreferences' | 'createInterface' | 'showDialog'>
  >;
  mockTronWebFactory: jest.Mocked<Pick<TronWebFactory, 'createClient'>>;
  mockTronWeb: {
    transactionBuilder: {
      withdrawExpireUnfreeze: jest.Mock;
    };
  };
  mockAssetsService: jest.Mocked<Pick<AssetsService, 'getAssetsByAccountId'>>;
  mockFeeCalculatorService: jest.Mocked<
    Pick<FeeCalculatorService, 'computeFee'>
  >;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * Wraps tests for ConfirmationHandler by creating a fresh instance with all
 * mock dependencies. The callback receives the handler and all mocks.
 *
 * @param testFunction - The test body receiving the handler and mocks.
 * @returns The return value of the callback.
 */
async function withConfirmationHandler<ReturnValue>(
  testFunction: WithConfirmationHandlerCallback<ReturnValue>,
): Promise<ReturnValue> {
  const mockTronWeb = {
    transactionBuilder: {
      withdrawExpireUnfreeze: jest
        .fn()
        // eslint-disable-next-line @typescript-eslint/naming-convention
        .mockResolvedValue({ raw_data: {} }),
    },
  };

  const mockTronWebFactory: jest.Mocked<Pick<TronWebFactory, 'createClient'>> =
    {
      createClient: jest.fn().mockReturnValue(mockTronWeb),
    };

  const mockAssetsService: jest.Mocked<
    Pick<AssetsService, 'getAssetsByAccountId'>
  > = {
    getAssetsByAccountId: jest.fn().mockResolvedValue([null, null]),
  };

  const mockFeeCalculatorService: jest.Mocked<
    Pick<FeeCalculatorService, 'computeFee'>
  > = {
    computeFee: jest.fn().mockResolvedValue(defaultFees),
  };

  const mockSnapClient: jest.Mocked<
    Pick<SnapClient, 'getPreferences' | 'createInterface' | 'showDialog'>
  > = {
    getPreferences: jest.fn().mockResolvedValue({
      locale: 'en',
      currency: 'usd',
      hideBalances: false,
      useSecurityAlerts: false,
      useExternalPricingData: false,
      simulateOnChainActions: false,
      useTokenDetection: true,
      batchCheckBalances: true,
      displayNftMedia: false,
      useNftDetection: false,
    }),
    createInterface: jest.fn().mockResolvedValue('mock-interface-id'),
    showDialog: jest.fn().mockResolvedValue(true),
  };

  const mockState: jest.Mocked<
    Pick<State<UnencryptedStateValue>, 'getKey' | 'setKey'>
  > = {
    getKey: jest.fn(),
    setKey: jest.fn(),
  };

  const handler = new ConfirmationHandler({
    snapClient: mockSnapClient,
    state: mockState,
    tronWebFactory: mockTronWebFactory,
    assetsService: mockAssetsService,
    feeCalculatorService: mockFeeCalculatorService,
  });

  return await testFunction({
    handler,
    mockSnapClient,
    mockTronWebFactory,
    mockTronWeb,
    mockAssetsService,
    mockFeeCalculatorService,
  });
}

describe('ConfirmationHandler', () => {
  describe('confirmClaimUnstakedTrx', () => {
    it('returns true when user confirms the dialog', async () => {
      await withConfirmationHandler(
        async ({
          handler,
          mockTronWebFactory,
          mockTronWeb,
          mockSnapClient,
        }) => {
          const result = await handler.confirmClaimUnstakedTrx({
            account: mockAccount,
            scope: Network.Mainnet,
          });

          expect(result).toBe(true);
          expect(mockTronWebFactory.createClient).toHaveBeenCalledWith(
            Network.Mainnet,
          );
          expect(
            mockTronWeb.transactionBuilder.withdrawExpireUnfreeze,
          ).toHaveBeenCalledWith(mockAccount.address);
          expect(mockSnapClient.createInterface).toHaveBeenCalled();
          expect(mockSnapClient.showDialog).toHaveBeenCalledWith(
            'mock-interface-id',
          );
        },
      );
    });

    it('returns false when user rejects the dialog', async () => {
      await withConfirmationHandler(async ({ handler, mockSnapClient }) => {
        mockSnapClient.showDialog.mockResolvedValue(null);

        const result = await handler.confirmClaimUnstakedTrx({
          account: mockAccount,
          scope: Network.Mainnet,
        });

        expect(result).toBe(false);
      });
    });

    it('fetches bandwidth and energy assets for fee computation', async () => {
      await withConfirmationHandler(async ({ handler, mockAssetsService }) => {
        await handler.confirmClaimUnstakedTrx({
          account: mockAccount,
          scope: Network.Mainnet,
        });

        expect(mockAssetsService.getAssetsByAccountId).toHaveBeenCalledWith(
          TEST_ACCOUNT_ID,
          [
            Networks[Network.Mainnet].bandwidth.id,
            Networks[Network.Mainnet].energy.id,
          ],
        );
      });
    });

    it('uses ZERO when bandwidth and energy assets are null', async () => {
      await withConfirmationHandler(
        async ({ handler, mockAssetsService, mockFeeCalculatorService }) => {
          mockAssetsService.getAssetsByAccountId.mockResolvedValue([
            null,
            null,
          ]);

          await handler.confirmClaimUnstakedTrx({
            account: mockAccount,
            scope: Network.Mainnet,
          });

          expect(mockFeeCalculatorService.computeFee).toHaveBeenCalledWith({
            scope: Network.Mainnet,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            transaction: { raw_data: {} },
            availableEnergy: ZERO,
            availableBandwidth: ZERO,
          });
        },
      );
    });

    it('uses actual asset amounts when bandwidth and energy assets exist', async () => {
      await withConfirmationHandler(
        async ({ handler, mockAssetsService, mockFeeCalculatorService }) => {
          const bandwidthAsset: ResourceAsset = {
            assetType: KnownCaip19Id.BandwidthMainnet,
            keyringAccountId: TEST_ACCOUNT_ID,
            network: Network.Mainnet,
            symbol: 'Bandwidth',
            decimals: 0,
            rawAmount: '5000',
            uiAmount: '5000',
            iconUrl: '',
          };
          const energyAsset: ResourceAsset = {
            assetType: KnownCaip19Id.EnergyMainnet,
            keyringAccountId: TEST_ACCOUNT_ID,
            network: Network.Mainnet,
            symbol: 'Energy',
            decimals: 0,
            rawAmount: '3000',
            uiAmount: '3000',
            iconUrl: '',
          };
          mockAssetsService.getAssetsByAccountId.mockResolvedValue([
            bandwidthAsset,
            energyAsset,
          ]);

          await handler.confirmClaimUnstakedTrx({
            account: mockAccount,
            scope: Network.Mainnet,
          });

          expect(mockFeeCalculatorService.computeFee).toHaveBeenCalledWith({
            scope: Network.Mainnet,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            transaction: { raw_data: {} },
            availableEnergy: new BigNumber('3000'),
            availableBandwidth: new BigNumber('5000'),
          });
        },
      );
    });

    it('throws InternalError when getPreferences fails', async () => {
      await withConfirmationHandler(async ({ handler, mockSnapClient }) => {
        mockSnapClient.getPreferences.mockRejectedValue(
          new Error('preferences unavailable'),
        );

        await expect(
          handler.confirmClaimUnstakedTrx({
            account: mockAccount,
            scope: Network.Mainnet,
          }),
        ).rejects.toThrow('Failed to retrieve Snap preferences.');
      });
    });

    it('sets iconUrl on each fee asset via getIconUrlForKnownAsset', async () => {
      await withConfirmationHandler(
        async ({ handler, mockFeeCalculatorService }) => {
          const feeAssetType = `${Network.Mainnet}/slip44:195`;
          const feesWithIcon: ComputeFeeResult = [
            {
              type: FeeType.Base,
              asset: {
                unit: 'TRX',
                type: feeAssetType,
                amount: '1000000',
                fungible: true,
              },
            },
          ];
          mockFeeCalculatorService.computeFee.mockResolvedValue(feesWithIcon);

          await handler.confirmClaimUnstakedTrx({
            account: mockAccount,
            scope: Network.Mainnet,
          });

          expect(mockGetIconUrlForKnownAsset).toHaveBeenCalledWith(
            feeAssetType,
          );
        },
      );
    });
  });
});
