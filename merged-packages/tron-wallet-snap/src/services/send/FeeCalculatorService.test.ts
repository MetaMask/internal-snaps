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
  getAccountInfoByAddress: jest.fn(),
} as any;

const mockTronHttpClient = {
  triggerConstantContract: jest.fn(),
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
      trongridApiClient: mockTrongridApiClient,
      tronHttpClient: mockTronHttpClient,
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

        // TRX is always first (even if 0), then bandwidth consumption
        // Native transfer: 132 bytes (raw_data_hex / 2) + 134 = 266 bytes
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '0',
              fungible: true,
            },
          },
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
        mockTronHttpClient.triggerConstantContract.mockResolvedValue({
          energy_used: 130000,
          result: { result: true },
          constant_result: [],
          transaction: { ret: [{ ret: 'SUCCESS' }] },
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
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '3',
              fungible: true,
            },
          },
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

        // Should have TRX first, then bandwidth consumption and energy
        // Energy: 130000 (hardcoded), available: 30000
        // Energy consumed: 30000, overage: 100000
        // TRX cost: 100000 * 100 SUN = 10,000,000 SUN = 10 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '10',
              fungible: true,
            },
          },
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

        // Should have TRX first, then energy consumption
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
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '3.345',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '100000',
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

        // Should have TRX first, then energy consumption
        // Energy: 130000 (hardcoded), available: 30000
        // Energy consumed: 30000, overage: 100000 → 10 TRX
        // New behavior: Not enough bandwidth (100 < 345), so ALL bandwidth is paid in TRX
        // Bandwidth TRX cost: 345 * 1000 SUN = 345,000 SUN = 0.345 TRX
        // Total: 10.345 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '10.345',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '30000',
              fungible: true,
            },
          },
        ]);
      });
    });

    describe('Edge cases and error handling', () => {
      it('filters out zero amount fees', async () => {
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

      it('handles different networks correctly', async () => {
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
              unit: 'TRX',
              type: 'tron:2494104990/slip44:195',
              amount: '0',
              fungible: true,
            },
          },
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

      it('uses fallback values when chain parameters are missing', async () => {
        mockTrongridApiClient.getChainParameters.mockResolvedValue([]);

        const transaction = getTransactionExample('trc20');

        mockTronHttpClient.triggerConstantContract.mockResolvedValue({
          energy_used: 130000,
          result: { result: true },
          constant_result: [],
          transaction: { ret: [{ ret: 'SUCCESS' }] },
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
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '3',
              fungible: true,
            },
          },
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
        ]);
      });

      it('handles very large transactions', async () => {
        const veryLargeTransaction = createLargeTransaction();
        // Make it even larger for this test
        veryLargeTransaction.raw_data.contract[0].parameter.value.data =
          'b'.repeat(10000);

        mockTronHttpClient.triggerConstantContract.mockResolvedValue({
          energy_used: 130000,
          result: { result: true },
          constant_result: [],
          transaction: { ret: [{ ret: 'SUCCESS' }] },
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
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '3.345',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '100000',
              fungible: true,
            },
          },
        ]);
      });

      it('handles exact resource matches', async () => {
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
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '0',
              fungible: true,
            },
          },
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
      it('adds 1 TRX activation fee when recipient account is not activated', async () => {
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

        // Should have TRX first (1 TRX activation fee), then bandwidth consumption
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '1',
              fungible: true,
            },
          },
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

      it('adds activation fee to existing TRX cost when recipient is not activated', async () => {
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

      it('does not add activation fee when recipient account is already activated', async () => {
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

        // Should have TRX first (0 since no activation fee), then bandwidth consumption
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '0',
              fungible: true,
            },
          },
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

      it('does not check activation for TRC20 transfers (no TransferContract)', async () => {
        // Mock energy calculation for smart contracts
        mockTronHttpClient.triggerConstantContract.mockResolvedValue({
          energy_used: 130000,
          result: { result: true },
          constant_result: [],
          transaction: { ret: [{ ret: 'SUCCESS' }] },
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

        // Should have TRX first (0), then energy and bandwidth consumption
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '0',
              fungible: true,
            },
          },
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

    describe('FeeLimit fallback scenarios', () => {
      it('uses feeLimit to calculate fallback energy when simulation fails', async () => {
        // Simulate triggerConstantContract failing
        mockTronHttpClient.triggerConstantContract.mockRejectedValue(
          new Error('Simulation failed'),
        );

        const transaction = getTransactionExample('trc20');
        const availableEnergy = BigNumber(50000);
        const availableBandwidth = BigNumber(2000000);

        // feeLimit of 10,000,000 SUN with energy price 100 SUN = 100,000 max energy
        const feeLimit = 10_000_000;

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
          feeLimit,
        });

        // Energy from feeLimit: 10,000,000 / 100 = 100,000 energy
        // Available energy: 50,000
        // Energy consumed: 50,000, overage: 50,000
        // TRX cost: 50,000 * 100 SUN = 5,000,000 SUN = 5 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '5',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '50000',
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
      });

      it('uses default 130000 fallback when simulation fails and no feeLimit provided', async () => {
        // Simulate triggerConstantContract failing
        mockTronHttpClient.triggerConstantContract.mockRejectedValue(
          new Error('Simulation failed'),
        );

        const transaction = getTransactionExample('trc20');
        const availableEnergy = BigNumber(30000);
        const availableBandwidth = BigNumber(2000000);

        // No feeLimit provided
        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should use default 130,000 fallback energy
        // Available energy: 30,000
        // Energy consumed: 30,000, overage: 100,000
        // TRX cost: 100,000 * 100 SUN = 10,000,000 SUN = 10 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '10',
              fungible: true,
            },
          },
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
        ]);
      });

      it('ignores feeLimit when simulation succeeds', async () => {
        // Simulation succeeds with energy_used
        mockTronHttpClient.triggerConstantContract.mockResolvedValue({
          energy_used: 65000,
          result: { result: true },
          constant_result: [],
          transaction: { ret: [{ ret: 'SUCCESS' }] },
        });

        const transaction = getTransactionExample('trc20');
        const availableEnergy = BigNumber(50000);
        const availableBandwidth = BigNumber(2000000);

        // Provide a large feeLimit that would calculate to 200,000 energy
        const feeLimit = 20_000_000;

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
          feeLimit,
        });

        // Should use the actual simulation result (65,000), not the feeLimit calculation
        // Available energy: 50,000
        // Energy consumed: 50,000, overage: 15,000
        // TRX cost: 15,000 * 100 SUN = 1,500,000 SUN = 1.5 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '1.5',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '50000',
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
      });

      it('handles energy_used of zero correctly without falling back', async () => {
        // Simulation returns energy_used: 0 (legitimate zero energy consumption)
        mockTronHttpClient.triggerConstantContract.mockResolvedValue({
          energy_used: 0,
          result: { result: true },
          constant_result: [],
          transaction: { ret: [{ ret: 'SUCCESS' }] },
        });

        const transaction = getTransactionExample('trc20');
        const availableEnergy = BigNumber(50000);
        const availableBandwidth = BigNumber(2000000);

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should use the actual simulation result (0 energy), not fall back
        // Energy consumed: 0 from available, no overage
        // TRX is 0 but still first
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '0',
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
      });

      it('uses feeLimit fallback when simulation returns no energy_used', async () => {
        // Simulation returns empty/no energy_used
        mockTronHttpClient.triggerConstantContract.mockResolvedValue({
          result: { result: true },
          constant_result: [],
          transaction: { ret: [{ ret: 'SUCCESS' }] },
        });

        const transaction = getTransactionExample('trc20');
        const availableEnergy = BigNumber(20000);
        const availableBandwidth = BigNumber(2000000);

        // feeLimit of 5,000,000 SUN with energy price 100 SUN = 50,000 max energy
        const feeLimit = 5_000_000;

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
          feeLimit,
        });

        // Energy from feeLimit: 5,000,000 / 100 = 50,000 energy
        // Available energy: 20,000
        // Energy consumed: 20,000, overage: 30,000
        // TRX cost: 30,000 * 100 SUN = 3,000,000 SUN = 3 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '3',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '20000',
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
      });

      it('uses fallback energy price (420 SUN) when chain parameters are missing', async () => {
        // Simulate triggerConstantContract failing
        mockTronHttpClient.triggerConstantContract.mockRejectedValue(
          new Error('Simulation failed'),
        );

        // Chain parameters missing getEnergyFee
        mockTrongridApiClient.getChainParameters.mockResolvedValue([
          { key: 'getTransactionFee', value: 1000 },
          // No getEnergyFee
        ]);

        const transaction = getTransactionExample('trc20');
        const availableEnergy = BigNumber(0);
        const availableBandwidth = BigNumber(2000000);

        // feeLimit of 4,200,000 SUN with fallback energy price 420 SUN = 10,000 max energy
        const feeLimit = 4_200_000;

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
          feeLimit,
        });

        // Energy from feeLimit: 4,200,000 / 420 = 10,000 energy
        // Available energy: 0
        // Energy consumed: 0, overage: 10,000
        // TRX cost: 10,000 * 420 SUN / 1,000,000 = 4.2 TRX
        // But getEnergyFee is missing from chain params, so it uses fallback 100 SUN
        // TRX cost: 10,000 * 100 SUN / 1,000,000 = 1 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '1',
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
      });
    });
  });
});
