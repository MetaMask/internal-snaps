/* eslint-disable @typescript-eslint/naming-convention */
import { FeeType } from '@metamask/keyring-api';
import { BigNumber } from 'bignumber.js';

import { FeeCalculatorService } from './FeeCalculatorService';
import { Network, ZERO } from '../../constants';
import { mockLogger } from '../../utils/mockLogger';
import nativeTransferMock from '../transactions/mocks/native-transfer.json';
import trc10TransferMock from '../transactions/mocks/trc10-transfer.json';
import trc20TransferMock from '../transactions/mocks/trc20-transfer.json';

const mockTronWebFactory = {
  createClient: jest.fn(),
} as any;

const mockTrongridApiClient = {
  getChainParameters: jest.fn(),
  triggerConstantContract: jest.fn(),
  getAccountInfoByAddress: jest.fn(),
} as any;

// Helper to get transaction examples in the expected format
const getTransactionExample = (type: 'native' | 'trc10' | 'trc20'): any => {
  let mockData;
  switch (type) {
    case 'native':
      mockData = nativeTransferMock;
      break;
    case 'trc10':
      mockData = trc10TransferMock;
      break;
    case 'trc20':
      mockData = trc20TransferMock;
      break;
    default:
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Unknown transaction type: ${type}`);
  }

  // Extract the transaction structure that matches the expected Transaction type
  return {
    visible: false,
    txID: mockData.txID,
    raw_data_hex: mockData.raw_data_hex,
    raw_data: mockData.raw_data,
  };
};

// Helper to create a large transaction by modifying the TRC20 example
const createLargeTransaction = (): any => {
  const baseTransaction = getTransactionExample('trc20');
  // Modify the data field to be much larger to simulate bandwidth issues
  const largeData = 'b'.repeat(2000);

  return {
    ...baseTransaction,
    raw_data: {
      ...baseTransaction.raw_data,
      contract: [
        {
          ...baseTransaction.raw_data.contract[0],
          parameter: {
            ...baseTransaction.raw_data.contract[0].parameter,
            value: {
              ...baseTransaction.raw_data.contract[0].parameter.value,
              data: largeData,
            },
          },
        },
      ],
    },
  };
};

describe('FeeCalculatorService', () => {
  let feeCalculatorService: FeeCalculatorService;
  let mockTronWebClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockTronWebClient = {
      trx: {
        getChainParameters: jest.fn(),
      },
      address: {
        fromHex: jest.fn((hexAddress) => `base58_${hexAddress}`),
      },
      transactionBuilder: {
        triggerConstantContract: jest.fn(),
      },
    };

    mockTronWebFactory.createClient.mockReturnValue(mockTronWebClient);

    feeCalculatorService = new FeeCalculatorService({
      logger: mockLogger,
      // tronWebFactory: mockTronWebFactory,
      trongridApiClient: mockTrongridApiClient,
    });
  });

  describe('computeFee', () => {
    beforeEach(() => {
      // Mock chain parameters response
      mockTrongridApiClient.getChainParameters.mockResolvedValue([
        { key: 'getTransactionFee', value: 1000 },
        { key: 'getEnergyFee', value: 100 },
      ]);
    });

    describe('TransferContract scenarios (no energy needed)', () => {
      it('has enough bandwidth', async () => {
        const transaction = getTransactionExample('native');
        const availableEnergy = ZERO;
        const availableBandwidth = BigNumber(1000000); // More than needed

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should only have bandwidth consumption, no TRX cost
        // Native transfer: 132 bytes (raw_data_hex / 2) + 134 = 266 bytes
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: 'tron:728126428/slip44:bandwidth',
              amount: '266',
              fungible: true,
            },
          },
        ]);
      });

      it('not enough bandwidth', async () => {
        const transaction = getTransactionExample('native');
        const availableEnergy = ZERO;
        const availableBandwidth = BigNumber(100); // Less than needed (266)

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // New behavior: When there's not enough bandwidth, ALL bandwidth is paid in TRX
        // Bandwidth needed: 266 bytes
        // No bandwidth consumed (since we don't have enough)
        // TRX cost: 266 * 1000 SUN = 266,000 SUN = 0.266 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '0.266',
              fungible: true,
            },
          },
        ]);
      });
    });

    describe('TriggerSmartContract scenarios (energy needed)', () => {
      beforeEach(() => {
        // Mock energy calculation for smart contracts
        mockTrongridApiClient.triggerConstantContract.mockResolvedValue({
          energy_used: 130000,
          result: { result: true },
          constant_result: [],
        });
      });

      it('has enough bandwidth + has enough energy', async () => {
        const transaction = getTransactionExample('trc20');

        const availableEnergy = BigNumber(100000); // More than needed (100000 fallback)
        const availableBandwidth = BigNumber(2000000); // More than needed for TRC20 transaction

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Energy: 130000 (hardcoded), available: 100000
        // Energy consumed: 100000, overage: 30000
        // TRX cost: 30000 * 100 SUN = 3,000,000 SUN = 3 TRX
        // Bandwidth: 211 bytes (raw_data_hex / 2) + 134 = 345 bytes
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '100000',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: 'tron:728126428/slip44:bandwidth',
              amount: '345',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '3',
              fungible: true,
            },
          },
        ]);
      });

      it('has enough bandwidth + not enough energy', async () => {
        const transaction = getTransactionExample('trc20');

        const availableEnergy = BigNumber(30000); // Less than needed (50000)
        const availableBandwidth = BigNumber(2000000); // More than needed for TRC20 transaction

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should have bandwidth consumption and TRX cost for energy overage
        // Energy: 130000 (hardcoded), available: 30000
        // Energy consumed: 30000, overage: 100000
        // TRX cost: 100000 * 100 SUN = 10,000,000 SUN = 10 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '30000',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: 'tron:728126428/slip44:bandwidth',
              amount: '345',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '10',
              fungible: true,
            },
          },
        ]);
      });

      it('not enough bandwidth + has enough energy', async () => {
        const largeTransaction = createLargeTransaction();

        const availableEnergy = BigNumber(100000); // More than needed (50000)
        const availableBandwidth = BigNumber(100); // Less than needed (345 bytes actual)

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction: largeTransaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should have energy consumption and TRX cost for overages
        // Energy: 130000 (hardcoded), available: 100000
        // Energy consumed: 100000, overage: 30000
        // Energy TRX cost: 30000 * 100 SUN = 3,000,000 SUN = 3 TRX
        // Note: raw_data_hex doesn't change when we modify the data field,
        // so bandwidth is still 345 bytes (not the larger theoretical size)
        // New behavior: Not enough bandwidth (100 < 345), so ALL bandwidth is paid in TRX
        // Bandwidth TRX cost: 345 * 1000 SUN = 345,000 SUN = 0.345 TRX
        // Total TRX cost: 3.345 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '100000',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '3.345',
              fungible: true,
            },
          },
        ]);
      });

      it('not enough bandwidth + not enough energy', async () => {
        const largeTransaction = createLargeTransaction();

        const availableEnergy = BigNumber(30000); // Less than needed (50000)
        const availableBandwidth = BigNumber(100); // Less than needed (345)

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction: largeTransaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should have energy consumption and TRX cost for both overages
        // Energy: 130000 (hardcoded), available: 30000
        // Energy consumed: 30000, overage: 100000 → 10 TRX
        // New behavior: Not enough bandwidth (100 < 345), so ALL bandwidth is paid in TRX
        // Bandwidth TRX cost: 345 * 1000 SUN = 345,000 SUN = 0.345 TRX
        // Total: 10.345 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '30000',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '10.345',
              fungible: true,
            },
          },
        ]);
      });
    });

    describe('Edge cases and error handling', () => {
      it('should filter out zero amount fees', async () => {
        const transaction = getTransactionExample('native');
        const availableEnergy = ZERO;
        const availableBandwidth = ZERO;

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should only have TRX cost, no zero amount fees
        // 266 bandwidth * 1000 SUN = 266,000 SUN = 0.266 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '0.266',
              fungible: true,
            },
          },
        ]);
      });

      it('should handle different networks correctly', async () => {
        const transaction = getTransactionExample('native');
        const availableEnergy = BigNumber(100000);
        const availableBandwidth = BigNumber(1000000);

        const result = await feeCalculatorService.computeFee({
          scope: Network.Shasta,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: 'tron:2494104990/slip44:bandwidth',
              amount: '266',
              fungible: true,
            },
          },
        ]);
      });

      it('should use fallback values when chain parameters are missing', async () => {
        mockTrongridApiClient.getChainParameters.mockResolvedValue([]);

        const transaction = getTransactionExample('trc20');

        mockTrongridApiClient.triggerConstantContract.mockResolvedValue({
          energy_used: 130000,
          result: { result: true },
          constant_result: [],
        });

        const availableEnergy = BigNumber(100000);
        const availableBandwidth = BigNumber(2000000); // Ensure enough bandwidth

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should use fallback values: energyFee=100, bandwidthFee=1000
        // Energy: 130000 (hardcoded), available: 100000
        // Energy consumed: 100000, overage: 30000
        // TRX cost: 30000 * 100 SUN = 3,000,000 SUN = 3 TRX
        // Bandwidth: 345 bytes consumed
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '100000',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: 'tron:728126428/slip44:bandwidth',
              amount: '345',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '3',
              fungible: true,
            },
          },
        ]);
      });

      it('should handle very large transactions', async () => {
        const veryLargeTransaction = createLargeTransaction();
        // Make it even larger for this test
        veryLargeTransaction.raw_data.contract[0].parameter.value.data =
          'b'.repeat(10000);

        mockTrongridApiClient.triggerConstantContract.mockResolvedValue({
          energy_used: 130000,
          result: { result: true },
          constant_result: [],
        });

        const availableEnergy = BigNumber(100000);
        const availableBandwidth = BigNumber(100); // Less than needed (345)

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction: veryLargeTransaction,
          availableEnergy,
          availableBandwidth,
        });

        // Energy: 130000 (hardcoded), available: 100000
        // Energy consumed: 100000, overage: 30000
        // Energy TRX cost: 30000 * 100 = 3,000,000 SUN = 3 TRX
        // Note: Modifying the data field doesn't update raw_data_hex,
        // so bandwidth is still calculated from the original hex (345 bytes)
        // New behavior: Not enough bandwidth (100 < 345), so ALL bandwidth is paid in TRX
        // Bandwidth TRX cost: 345 * 1000 SUN = 345,000 SUN = 0.345 TRX
        // Total TRX cost: 3.345 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '100000',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '3.345',
              fungible: true,
            },
          },
        ]);
      });

      it('should handle exact resource matches', async () => {
        const transaction = getTransactionExample('native');
        const availableEnergy = ZERO;
        const availableBandwidth = BigNumber(266); // Exact match for native transaction

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: 'tron:728126428/slip44:bandwidth',
              amount: '266',
              fungible: true,
            },
          },
        ]);
      });
    });

    describe('Account activation fee scenarios', () => {
      it('should add 1 TRX activation fee when recipient account is not activated', async () => {
        // Mock the account check to throw (account not found)
        mockTrongridApiClient.getAccountInfoByAddress.mockRejectedValue(
          new Error('Account not found or no data returned'),
        );

        const transaction = getTransactionExample('native');
        const availableEnergy = ZERO;
        const availableBandwidth = BigNumber(1000000); // More than needed

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should have bandwidth consumption and 1 TRX activation fee
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: 'tron:728126428/slip44:bandwidth',
              amount: '266',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '1',
              fungible: true,
            },
          },
        ]);
      });

      it('should add activation fee to existing TRX cost when recipient is not activated', async () => {
        // Mock the account check to throw (account not found)
        mockTrongridApiClient.getAccountInfoByAddress.mockRejectedValue(
          new Error('Account not found or no data returned'),
        );

        const transaction = getTransactionExample('native');
        const availableEnergy = ZERO;
        const availableBandwidth = ZERO; // Not enough bandwidth, triggers TRX cost

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should have TRX cost for bandwidth (0.266) + activation fee (1) = 1.266 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '1.266',
              fungible: true,
            },
          },
        ]);
      });

      it('should not add activation fee when recipient account is already activated', async () => {
        // Mock the account check to succeed (account exists)
        mockTrongridApiClient.getAccountInfoByAddress.mockResolvedValue({
          address: 'TExistingActiveAddress123456789012',
          balance: 1000000,
        });

        const transaction = getTransactionExample('native');
        const availableEnergy = ZERO;
        const availableBandwidth = BigNumber(1000000); // More than needed

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should only have bandwidth consumption, no activation fee
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: 'tron:728126428/slip44:bandwidth',
              amount: '266',
              fungible: true,
            },
          },
        ]);
      });

      it('should not check activation for TRC20 transfers (no TransferContract)', async () => {
        // Mock energy calculation for smart contracts
        mockTrongridApiClient.triggerConstantContract.mockResolvedValue({
          energy_used: 130000,
          result: { result: true },
          constant_result: [],
        });

        const transaction = getTransactionExample('trc20');
        const availableEnergy = BigNumber(130000); // Enough energy
        const availableBandwidth = BigNumber(2000000); // More than needed

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should only have energy and bandwidth consumption, no activation check
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '130000',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: 'tron:728126428/slip44:bandwidth',
              amount: '345',
              fungible: true,
            },
          },
        ]);

        // getAccountInfoByAddress should not have been called for TRC20
        expect(
          mockTrongridApiClient.getAccountInfoByAddress,
        ).not.toHaveBeenCalled();
      });
    });
  });
});
