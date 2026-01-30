/* eslint-disable @typescript-eslint/naming-convention */
import { FeeType } from '@metamask/keyring-api';
import { BigNumber } from 'bignumber.js';

import { SendService } from './SendService';
import { Network, Networks } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import { SendErrorCodes } from '../../handlers/clientRequest/types';
import { mockLogger } from '../../utils/mockLogger';

describe('SendService', () => {
  describe('validateSend', () => {
    let sendService: SendService;
    let mockAccountsService: any;
    let mockAssetsService: any;
    let mockTronWebFactory: any;
    let mockFeeCalculatorService: any;
    let mockSnapClient: any;
    let mockTronWeb: any;

    const TEST_ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';
    const TEST_TO_ADDRESS = 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx';
    const TEST_FROM_ADDRESS = 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT';

    const scope = Network.Mainnet;
    const nativeTokenId = Networks[scope].nativeToken.id;
    const bandwidthId = Networks[scope].bandwidth.id;
    const energyId = Networks[scope].energy.id;

    const createNativeAsset = (): AssetEntity =>
      ({
        assetType: nativeTokenId,
        keyringAccountId: TEST_ACCOUNT_ID,
        network: scope,
        symbol: 'TRX',
        decimals: 6,
        rawAmount: '0',
        uiAmount: '0',
        iconUrl: '',
      }) as AssetEntity;

    const createTrc20Asset = (): AssetEntity =>
      ({
        assetType: `${scope}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`,
        keyringAccountId: TEST_ACCOUNT_ID,
        network: scope,
        symbol: 'USDT',
        decimals: 6,
        rawAmount: '0',
        uiAmount: '0',
        iconUrl: '',
      }) as AssetEntity;

    const createMockTransaction = () => ({
      txID: 'mock-tx-id',
      raw_data: {
        contract: [
          {
            type: 'TransferContract',
            parameter: {
              value: {
                owner_address: `41${'a'.repeat(40)}`,
                to_address: `41${'b'.repeat(40)}`,
                amount: 1000000,
              },
            },
          },
        ],
      },
      raw_data_hex: 'mock-hex',
    });

    beforeEach(() => {
      jest.clearAllMocks();

      mockAccountsService = {
        findByIdOrThrow: jest.fn().mockResolvedValue({
          id: TEST_ACCOUNT_ID,
          address: TEST_FROM_ADDRESS,
          entropySource: 'test-entropy',
          derivationPath: [],
        }),
      };

      mockAssetsService = {
        getAssetsByAccountId: jest.fn(),
      };

      mockTronWeb = {
        transactionBuilder: {
          sendTrx: jest.fn().mockResolvedValue(createMockTransaction()),
          sendToken: jest.fn().mockResolvedValue(createMockTransaction()),
          triggerSmartContract: jest.fn().mockResolvedValue({
            transaction: createMockTransaction(),
          }),
        },
      };

      mockTronWebFactory = {
        createClient: jest.fn().mockReturnValue(mockTronWeb),
      };

      mockFeeCalculatorService = {
        computeFee: jest.fn(),
      };

      mockSnapClient = {};

      sendService = new SendService({
        accountsService: mockAccountsService,
        assetsService: mockAssetsService,
        tronWebFactory: mockTronWebFactory,
        feeCalculatorService: mockFeeCalculatorService,
        logger: mockLogger,
        snapClient: mockSnapClient,
      });
    });

    describe('native TRX transfers', () => {
      it('returns valid when user has enough TRX to cover amount and fees', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(10); // Sending 10 TRX

        // User has 100 TRX, 1000 bandwidth, 0 energy
        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          { uiAmount: '100', rawAmount: '100000000' }, // TRX balance (asset being sent)
          { uiAmount: '100', rawAmount: '100000000' }, // TRX balance (native token)
          { rawAmount: '1000' }, // Bandwidth
          { rawAmount: '0' }, // Energy
        ]);

        // Fee is 0 TRX (user has enough bandwidth)
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '0',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: bandwidthId,
              amount: '266',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({ valid: true });
        expect(mockAssetsService.getAssetsByAccountId).toHaveBeenCalledWith(
          TEST_ACCOUNT_ID,
          [nativeTokenId, nativeTokenId, bandwidthId, energyId],
        );
      });

      it('returns InsufficientBalance when user does not have enough TRX to send', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(100); // Trying to send 100 TRX

        // User only has 50 TRX
        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          { uiAmount: '50', rawAmount: '50000000' }, // TRX balance (asset being sent)
          { uiAmount: '50', rawAmount: '50000000' }, // TRX balance (native token)
          { rawAmount: '1000' }, // Bandwidth
          { rawAmount: '0' }, // Energy
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({
          valid: false,
          errorCode: SendErrorCodes.InsufficientBalance,
        });
        // Should not call feeCalculatorService since we fail early
        expect(mockFeeCalculatorService.computeFee).not.toHaveBeenCalled();
      });

      it('returns InsufficientBalanceToCoverFee when TRX amount + fees exceed balance', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(99); // Sending 99 TRX

        // User has 100 TRX but no bandwidth (fees will be charged in TRX)
        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          { uiAmount: '100', rawAmount: '100000000' }, // TRX balance (asset being sent)
          { uiAmount: '100', rawAmount: '100000000' }, // TRX balance (native token)
          { rawAmount: '0' }, // No bandwidth
          { rawAmount: '0' }, // No energy
        ]);

        // Fee is 2 TRX (user has no bandwidth, must pay in TRX)
        // Total needed: 99 + 2 = 101 TRX, but user only has 100
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '2',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({
          valid: false,
          errorCode: SendErrorCodes.InsufficientBalanceToCoverFee,
        });
      });

      it('returns valid when sending exact balance minus fees', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(98); // Sending 98 TRX

        // User has 100 TRX, no bandwidth
        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          { uiAmount: '100', rawAmount: '100000000' }, // TRX balance
          { uiAmount: '100', rawAmount: '100000000' }, // TRX balance (native token)
          { rawAmount: '0' }, // No bandwidth
          { rawAmount: '0' }, // No energy
        ]);

        // Fee is 2 TRX
        // Total needed: 98 + 2 = 100 TRX, user has exactly 100
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '2',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({ valid: true });
      });
    });

    describe('TRC20 token transfers', () => {
      it('returns valid when user has enough tokens and TRX for fees', async () => {
        const asset = createTrc20Asset();
        const amount = new BigNumber(50); // Sending 50 USDT

        // User has 100 USDT, 10 TRX for fees, some energy
        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          { uiAmount: '100', rawAmount: '100000000' }, // USDT balance (asset being sent)
          { uiAmount: '10', rawAmount: '10000000' }, // TRX balance (native token for fees)
          { rawAmount: '500' }, // Bandwidth
          { rawAmount: '50000' }, // Energy
        ]);

        // Fee is 3 TRX (energy overage)
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '3',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: energyId,
              amount: '50000',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: bandwidthId,
              amount: '345',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({ valid: true });
      });

      it('returns InsufficientBalance when user does not have enough tokens', async () => {
        const asset = createTrc20Asset();
        const amount = new BigNumber(100); // Trying to send 100 USDT

        // User only has 50 USDT
        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          { uiAmount: '50', rawAmount: '50000000' }, // USDT balance (not enough)
          { uiAmount: '100', rawAmount: '100000000' }, // TRX balance (plenty for fees)
          { rawAmount: '1000' }, // Bandwidth
          { rawAmount: '100000' }, // Energy
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({
          valid: false,
          errorCode: SendErrorCodes.InsufficientBalance,
        });
        expect(mockFeeCalculatorService.computeFee).not.toHaveBeenCalled();
      });

      it('returns InsufficientBalanceToCoverFee when user has tokens but not enough TRX for fees', async () => {
        const asset = createTrc20Asset();
        const amount = new BigNumber(50); // Sending 50 USDT

        // User has 100 USDT but only 1 TRX (not enough for fees)
        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          { uiAmount: '100', rawAmount: '100000000' }, // USDT balance (plenty)
          { uiAmount: '1', rawAmount: '1000000' }, // TRX balance (not enough for fees)
          { rawAmount: '0' }, // No bandwidth
          { rawAmount: '0' }, // No energy
        ]);

        // Fee is 10 TRX (no energy/bandwidth, everything paid in TRX)
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '10',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({
          valid: false,
          errorCode: SendErrorCodes.InsufficientBalanceToCoverFee,
        });
      });

      it('returns valid when user has tokens and exact TRX for fees', async () => {
        const asset = createTrc20Asset();
        const amount = new BigNumber(50); // Sending 50 USDT

        // User has 100 USDT and exactly 5 TRX for fees
        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          { uiAmount: '100', rawAmount: '100000000' }, // USDT balance
          { uiAmount: '5', rawAmount: '5000000' }, // TRX balance (exact for fees)
          { rawAmount: '0' }, // No bandwidth
          { rawAmount: '0' }, // No energy
        ]);

        // Fee is exactly 5 TRX
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '5',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        expect(result).toStrictEqual({ valid: true });
      });
    });

    describe('edge cases', () => {
      it('handles missing asset balances (undefined)', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(10);

        // All balances are undefined
        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          undefined, // No asset balance
          undefined, // No native token balance
          undefined, // No bandwidth
          undefined, // No energy
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        // Should fail because user has 0 balance
        expect(result).toStrictEqual({
          valid: false,
          errorCode: SendErrorCodes.InsufficientBalance,
        });
      });

      it('handles zero amount send with fees', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(0); // Sending 0 TRX

        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          { uiAmount: '1', rawAmount: '1000000' }, // 1 TRX balance
          { uiAmount: '1', rawAmount: '1000000' }, // 1 TRX native
          { rawAmount: '0' }, // No bandwidth
          { rawAmount: '0' }, // No energy
        ]);

        // Fee is 0.5 TRX
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '0.5',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        // Total needed: 0 + 0.5 = 0.5 TRX, user has 1 TRX
        expect(result).toStrictEqual({ valid: true });
      });

      it('handles fee calculation with no TRX fee (all covered by resources)', async () => {
        const asset = createTrc20Asset();
        const amount = new BigNumber(10);

        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          { uiAmount: '100', rawAmount: '100000000' }, // USDT balance
          { uiAmount: '0', rawAmount: '0' }, // 0 TRX balance
          { rawAmount: '10000' }, // Plenty of bandwidth
          { rawAmount: '200000' }, // Plenty of energy
        ]);

        // Fee is 0 TRX (user has enough bandwidth and energy)
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '0',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: energyId,
              amount: '65000',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: bandwidthId,
              amount: '345',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        // User can send tokens even with 0 TRX because fees are covered by resources
        expect(result).toStrictEqual({ valid: true });
      });

      it('handles account activation fee (1 TRX) for new recipient', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(1); // Sending 1 TRX to new account

        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          { uiAmount: '2', rawAmount: '2000000' }, // 2 TRX balance
          { uiAmount: '2', rawAmount: '2000000' }, // 2 TRX native
          { rawAmount: '1000' }, // Bandwidth (enough)
          { rawAmount: '0' }, // No energy needed for native transfer
        ]);

        // Fee includes 1 TRX activation fee
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '1', // 1 TRX activation fee
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: bandwidthId,
              amount: '266',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        // Total needed: 1 (amount) + 1 (activation) = 2 TRX, user has exactly 2
        expect(result).toStrictEqual({ valid: true });
      });

      it('fails when account activation fee causes insufficient balance', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(1.5); // Sending 1.5 TRX to new account

        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          { uiAmount: '2', rawAmount: '2000000' }, // 2 TRX balance
          { uiAmount: '2', rawAmount: '2000000' }, // 2 TRX native
          { rawAmount: '1000' }, // Bandwidth (enough)
          { rawAmount: '0' }, // No energy
        ]);

        // Fee includes 1 TRX activation fee
        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '1', // 1 TRX activation fee
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: bandwidthId,
              amount: '266',
              fungible: true,
            },
          },
        ]);

        const result = await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        // Total needed: 1.5 (amount) + 1 (activation) = 2.5 TRX, user only has 2
        expect(result).toStrictEqual({
          valid: false,
          errorCode: SendErrorCodes.InsufficientBalanceToCoverFee,
        });
      });
    });

    describe('transaction building', () => {
      it('builds transaction with correct toAddress for fee calculation', async () => {
        const asset = createNativeAsset();
        const amount = new BigNumber(10);

        mockAssetsService.getAssetsByAccountId.mockResolvedValue([
          { uiAmount: '100', rawAmount: '100000000' },
          { uiAmount: '100', rawAmount: '100000000' },
          { rawAmount: '1000' },
          { rawAmount: '0' },
        ]);

        mockFeeCalculatorService.computeFee.mockResolvedValue([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: nativeTokenId,
              amount: '0',
              fungible: true,
            },
          },
        ]);

        await sendService.validateSend({
          scope,
          fromAccountId: TEST_ACCOUNT_ID,
          toAddress: TEST_TO_ADDRESS,
          asset,
          amount,
        });

        // Verify transaction was built with the actual toAddress
        expect(mockTronWeb.transactionBuilder.sendTrx).toHaveBeenCalledWith(
          TEST_TO_ADDRESS,
          10 * 1e6, // Amount in SUN
          TEST_FROM_ADDRESS,
        );

        // Verify fee calculator was called with the built transaction
        expect(mockFeeCalculatorService.computeFee).toHaveBeenCalledWith({
          scope,
          transaction: expect.objectContaining({ txID: 'mock-tx-id' }),
          availableEnergy: expect.any(BigNumber),
          availableBandwidth: expect.any(BigNumber),
        });
      });
    });
  });
});
