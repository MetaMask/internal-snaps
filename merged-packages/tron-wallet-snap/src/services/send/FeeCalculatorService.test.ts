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
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: 'tron:728126428/slip44:bandwidth',
              amount: '758000',
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
        const availableBandwidth = BigNumber(1000); // Less than needed

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should only have TRX cost for bandwidth overage
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '758.000000',
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

        const availableEnergy = BigNumber(100000); // More than needed (55001)
        const availableBandwidth = BigNumber(2000000); // More than needed for TRC20 transaction

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should have both energy and bandwidth consumption, no TRX cost
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '55001',
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
              amount: '1083000',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
        ]);
      });

      it('has enough bandwidth + not enough energy', async () => {
        const transaction = getTransactionExample('trc20');

        const availableEnergy = BigNumber(30000); // Less than needed (55001)
        const availableBandwidth = BigNumber(2000000); // More than needed for TRC20 transaction

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should have bandwidth consumption and TRX cost for energy overage
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
              amount: '1083000',
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
              amount: '2.500100',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
        ]);
      });

      it('not enough bandwidth + has enough energy', async () => {
        const largeTransaction = createLargeTransaction();

        const availableEnergy = BigNumber(100000); // More than needed (55001)
        const availableBandwidth = BigNumber(1000); // Less than needed

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction: largeTransaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should have energy consumption and TRX cost for bandwidth overage
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '55001',
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
              amount: '2947.000000',
              fungible: true,
              imageSvg:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
            },
          },
        ]);
      });

      it('not enough bandwidth + not enough energy', async () => {
        const largeTransaction = createLargeTransaction();

        const availableEnergy = BigNumber(30000); // Less than needed (55001)
        const availableBandwidth = BigNumber(1000); // Less than needed

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction: largeTransaction,
          availableEnergy,
          availableBandwidth,
        });

        // Should have energy consumption and TRX cost for both energy and bandwidth overages
        // Note: bandwidth consumption is 0 when there's not enough bandwidth, so it gets filtered out
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
              amount: '2949.500100',
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
        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '758.000000',
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
              amount: '758000',
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
              amount: '1083000',
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
              amount: '6.500000',
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
        const availableBandwidth = BigNumber(1000);

        const result = await feeCalculatorService.computeFee({
          scope: Network.Mainnet,
          transaction: veryLargeTransaction,
          availableEnergy,
          availableBandwidth,
        });

        expect(result).toStrictEqual([
          {
            type: FeeType.Base,
            asset: {
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              amount: '55001',
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
              amount: '10947.000000',
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
        const availableBandwidth = BigNumber(758000); // Exact match for native transaction

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
              amount: '758000',
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
