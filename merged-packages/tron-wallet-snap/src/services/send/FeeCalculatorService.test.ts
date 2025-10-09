/* eslint-disable @typescript-eslint/naming-convention */
import { FeeType } from '@metamask/keyring-api';
import { BigNumber } from 'bignumber.js';

import { FeeCalculatorService } from './FeeCalculatorService';
import { Network } from '../../constants';
import { mockLogger } from '../../utils/mockLogger';

const mockTronWebFactory = {
  createClient: jest.fn(),
} as any;

const mockTrongridApiClient = {
  getChainParameters: jest.fn(),
} as any;

const createBase64Transaction = (contractType: string, data: any = {}) => {
  const transaction = {
    raw_data: {
      contract: [
        {
          type: contractType,
          parameter: {
            value: data,
          },
        },
      ],
    },
  };
  // eslint-disable-next-line no-restricted-globals
  return Buffer.from(JSON.stringify(transaction)).toString('base64');
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
        const transaction = createBase64Transaction('TransferContract');
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
              amount: '80000',
              fungible: true,
            },
          },
        ]);
      });

      it('not enough bandwidth', async () => {
        const transaction = createBase64Transaction('TransferContract');
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
              amount: '80.000000',
              fungible: true,
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
        const transaction = createBase64Transaction('TriggerSmartContract', {
          contract_address: 'a'.repeat(64),
          data: '0xa9059cbb000000000000000000000000',

          owner_address: 'b'.repeat(64),

          call_value: 0,
        });

        const availableEnergy = BigNumber(100000); // More than needed (55001)
        const availableBandwidth = BigNumber(1000000); // More than needed

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
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: 'tron:728126428/slip44:bandwidth',
              amount: '311000',
              fungible: true,
            },
          },
        ]);
      });

      it('has enough bandwidth + not enough energy', async () => {
        const transaction = createBase64Transaction('TriggerSmartContract', {
          contract_address: 'a'.repeat(64),
          data: '0xa9059cbb000000000000000000000000',

          owner_address: 'b'.repeat(64),

          call_value: 0,
        });

        const availableEnergy = BigNumber(30000); // Less than needed (55001)
        const availableBandwidth = BigNumber(1000000); // More than needed

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
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: 'tron:728126428/slip44:bandwidth',
              amount: '311000',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '2.500100',
              fungible: true,
            },
          },
        ]);
      });

      it('not enough bandwidth + has enough energy', async () => {
        const largeTransaction = createBase64Transaction(
          'TriggerSmartContract',
          {
            contract_address: 'a'.repeat(64),
            data: 'b'.repeat(2000), // Large data to increase bandwidth
            owner_address: 'c'.repeat(64),
            call_value: 0,
          },
        );

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
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '2277.000000',
              fungible: true,
            },
          },
        ]);
      });

      it('not enough bandwidth + not enough energy', async () => {
        const largeTransaction = createBase64Transaction(
          'TriggerSmartContract',
          {
            contract_address: 'a'.repeat(64),
            data: 'b'.repeat(2000), // Large data to increase bandwidth
            owner_address: 'c'.repeat(64),
            call_value: 0,
          },
        );

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
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '2279.500100',
              fungible: true,
            },
          },
        ]);
      });
    });

    describe('Edge cases and error handling', () => {
      it('should filter out zero amount fees', async () => {
        const transaction = createBase64Transaction('TransferContract');
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
              amount: '80.000000',
              fungible: true,
            },
          },
        ]);
      });

      it('should handle different networks correctly', async () => {
        const transaction = createBase64Transaction('TransferContract');
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
              amount: '80000',
              fungible: true,
            },
          },
        ]);
      });

      it('should use fallback values when chain parameters are missing', async () => {
        mockTrongridApiClient.getChainParameters.mockResolvedValue([]);

        const transaction = createBase64Transaction('TriggerSmartContract', {
          contract_address: 'a'.repeat(64),
          data: '0xa9059cbb000000000000000000000000',
          owner_address: 'b'.repeat(64),
          call_value: 0,
        });

        mockTronWebClient.transactionBuilder.triggerConstantContract.mockResolvedValue(
          {
            energy_used: 150000,
          },
        );

        const availableEnergy = BigNumber(100000);
        const availableBandwidth = BigNumber(1000000);

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
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'BANDWIDTH',
              type: 'tron:728126428/slip44:bandwidth',
              amount: '311000',
              fungible: true,
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '6.500000',
              fungible: true,
            },
          },
        ]);
      });

      it('should handle very large transactions', async () => {
        const veryLargeTransaction = createBase64Transaction(
          'TriggerSmartContract',
          {
            contract_address: 'a'.repeat(64),
            data: 'b'.repeat(10000), // Very large data

            owner_address: 'c'.repeat(64),

            call_value: 0,
          },
        );

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
            },
          },
          {
            type: FeeType.Base,
            asset: {
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              amount: '10277.000000',
              fungible: true,
            },
          },
        ]);
      });

      it('should handle exact resource matches', async () => {
        const transaction = createBase64Transaction('TransferContract');
        const availableEnergy = BigNumber(0);
        const availableBandwidth = BigNumber(80000);

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
              amount: '80000',
              fungible: true,
            },
          },
        ]);
      });
    });
  });
});
