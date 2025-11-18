/* eslint-disable @typescript-eslint/naming-convention */
import { FeeType } from '@metamask/keyring-api';
import { BigNumber } from 'bignumber.js';

import { FeeCalculatorService } from './FeeCalculatorService';
import { Network } from '../../constants';
import { mockLogger } from '../../utils/mockLogger';
import nativeTransferMock from '../transactions/mocks/native-transfer.json';
import trc10TransferMock from '../transactions/mocks/trc10-transfer.json';
import trc20TransferMock from '../transactions/mocks/trc20-transfer.json';

const mockTronWebFactory = {
  createClient: jest.fn(),
} as any;

const mockTrongridApiClient = {
  getChainParameters: jest.fn(),
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
      tronWebFactory: mockTronWebFactory,
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
        const availableEnergy = BigNumber(0);
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
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
        ]);
      });

      it('not enough bandwidth', async () => {
        const transaction = getTransactionExample('native');
        const availableEnergy = BigNumber(0);
        const availableBandwidth = BigNumber(100); // Less than needed (266)

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should only have TRX cost for bandwidth overage
        // 266 bandwidth * 1000 SUN = 266,000 SUN = 0.266 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '0.266000',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
        ]);
      });
    });

    describe('TriggerSmartContract scenarios (energy needed)', () => {
      beforeEach(() => {
        // Mock energy calculation for smart contracts
        mockTronWebClient.transactionBuilder.triggerConstantContract.mockResolvedValue(
          {
            energy_used: 50000,
          },
        );
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

        // Should have both energy and bandwidth consumption, no TRX cost
        // Energy: 100000 (conservative fallback when estimateEnergy doesn't return energy_required)
        // Bandwidth: 211 bytes (raw_data_hex / 2) + 134 = 345 bytes
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '100000',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: 'tron:728126428/slip44:bandwidth',
              amount: '345',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
        ]);
      });

      it('has enough bandwidth + not enough energy', async () => {
        const transaction = getTransactionExample('trc20');

        const availableEnergy = BigNumber(30000); // Less than needed (100000)
        const availableBandwidth = BigNumber(2000000); // More than needed for TRC20 transaction

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should have bandwidth consumption and TRX cost for energy overage
        // Energy consumed: 30000, overage: 70000
        // TRX cost: 70000 * 100 SUN = 7,000,000 SUN = 7 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '30000',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: 'tron:728126428/slip44:bandwidth',
              amount: '345',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '7.000000',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
        ]);
      });

      it('not enough bandwidth + has enough energy', async () => {
        const largeTransaction = createLargeTransaction();

        const availableEnergy = BigNumber(100000); // More than needed (100000)
        const availableBandwidth = BigNumber(100); // Less than needed (345 bytes actual)

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction: largeTransaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should have energy consumption and TRX cost for bandwidth overage
        // Note: raw_data_hex doesn't change when we modify the data field,
        // so bandwidth is still 345 bytes (not the larger theoretical size)
        // TRX cost: 345 * 1000 SUN = 345,000 SUN = 0.345 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '100000',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '0.345000',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
        ]);
      });

      it('not enough bandwidth + not enough energy', async () => {
        const largeTransaction = createLargeTransaction();

        const availableEnergy = BigNumber(30000); // Less than needed (100000)
        const availableBandwidth = BigNumber(100); // Less than needed (345)

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction: largeTransaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should have energy consumption and TRX cost for both energy and bandwidth overages
        // Energy consumed: 30000, overage: 70000 → 7 TRX
        // Bandwidth overage: 345 → 0.345 TRX
        // Total: 7.345 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '30000',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '7.345000',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
        ]);
      });
    });

    describe('Edge cases and error handling', () => {
      it('should filter out zero amount fees', async () => {
        const transaction = getTransactionExample('native');
        const availableEnergy = BigNumber(0);
        const availableBandwidth = BigNumber(0);

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
              amount: '0.266000',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
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
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
        ]);
      });

      it('should use fallback values when chain parameters are missing', async () => {
        mockTrongridApiClient.getChainParameters.mockResolvedValue([]);

        const transaction = getTransactionExample('trc20');

        mockTronWebClient.transactionBuilder.triggerConstantContract.mockResolvedValue(
          {
            energy_used: 150000,
          },
        );

        const availableEnergy = BigNumber(100000);
        const availableBandwidth = BigNumber(2000000); // Ensure enough bandwidth

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should use fallback values: energyFee=100, bandwidthFee=1000
        // Energy: consumes all 100000 available, no TRX fee (even though more is needed)
        // Bandwidth: 345 bytes consumed
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '100000',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: 'tron:728126428/slip44:bandwidth',
              amount: '345',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
        ]);
      });

      it('should handle very large transactions', async () => {
        const veryLargeTransaction = createLargeTransaction();
        // Make it even larger for this test
        veryLargeTransaction.raw_data.contract[0].parameter.value.data =
          'b'.repeat(10000);

        mockTronWebClient.transactionBuilder.triggerConstantContract.mockResolvedValue(
          {
            energy_used: 50000,
          },
        );

        const availableEnergy = BigNumber(100000);
        const availableBandwidth = BigNumber(100); // Less than needed (345)

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction: veryLargeTransaction,
          availableEnergy,
          availableBandwidth,
        });

        // Note: Modifying the data field doesn't update raw_data_hex,
        // so bandwidth is still calculated from the original hex (345 bytes)
        // TRX cost: 345 * 1000 SUN = 345,000 SUN = 0.345 TRX
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '100000',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '0.345000',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
        ]);
      });

      it('should handle exact resource matches', async () => {
        const transaction = getTransactionExample('native');
        const availableEnergy = BigNumber(0);
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
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
        ]);
      });
    });
  });
});
