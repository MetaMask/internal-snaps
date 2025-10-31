// eslint-disable-file @typescript-eslint/no-non-null-assertion
import { TransactionMapper } from './TransactionsMapper';
import type {
  TransactionInfo,
  ContractTransactionInfo,
} from '../../clients/trongrid/types';
import { Network } from '../../constants';
import type { TronKeyringAccount } from '../../entities';
import contractInfoMock from './mocks/contract-info.json';
import nativeTransferMock from './mocks/native-transfer.json';
import trc10TransferMock from './mocks/trc10-transfer.json';
import trc20TransferMock from './mocks/trc20-transfer.json';

describe('TransactionMapper', () => {
  const mockAccount: TronKeyringAccount = {
    id: 'test-account-id',
    address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx', // From native and TRC20 transfers
    type: 'eip155:eoa',
    options: {},
    methods: [],
    scopes: ['tron:728126428'],
    entropySource: 'test-entropy',
    derivationPath: 'm/0/0',
    index: 0,
  };

  describe('mapTransaction', () => {
    describe('TransferContract (Native TRX transfers)', () => {
      it('should map a native TRX send transaction correctly', () => {
        const rawTransaction = nativeTransferMock as TransactionInfo;

        const result = TransactionMapper.mapTransaction({
          scope: Network.Mainnet,
          account: mockAccount,
          trongridTransaction: rawTransaction,
        });

        console.log(
          'Native TRX Transaction Result:',
          JSON.stringify(result, null, 2),
        );

        const expectedTransaction = {
          account: 'test-account-id',
          type: 'send',
          id: '8145535b24f71bc592b8ab2d94e91a30d12f74ab33fa4aab2ff2a27b767fc49b',
          from: [
            {
              address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
              asset: {
                amount: '0.01',
                unit: 'TRX',
                type: 'tron:728126428/slip44:195',
                fungible: true,
              },
            },
          ],
          to: [
            {
              address: 'TEFik7dGm6r5Y1Af9mGwnELuJLa1jXDDUB',
              asset: {
                amount: '0.01',
                unit: 'TRX',
                type: 'tron:728126428/slip44:195',
                fungible: true,
              },
            },
          ],
          chain: 'tron:728126428',
          status: 'confirmed',
          timestamp: 1756914747,
          events: [
            {
              status: 'confirmed',
              timestamp: 1756914747,
            },
          ],
          fees: [
            {
              asset: {
                amount: '266000',
                unit: 'TRX',
                type: 'tron:728126428/slip44:195',
                fungible: true,
              },
              type: 'base',
            },
          ],
        };

        expect(result).toStrictEqual(expectedTransaction);
      });
    });

    describe('TransferAssetContract (TRC10 transfers)', () => {
      it('should map a TRC10 send transaction correctly', () => {
        // Use the actual address from the TRC10 transaction mock instead of converting
        const trc10Account: TronKeyringAccount = {
          ...mockAccount,
          id: 'test-trc10-account',
          address: 'TFDP1vFeSYPT6FUznL7zUjhg5X7p2AA8vw', // Actual address from TRC10 mock
        };

        const rawTransaction = trc10TransferMock as TransactionInfo;

        const result = TransactionMapper.mapTransaction({
          scope: Network.Mainnet,
          account: trc10Account,
          trongridTransaction: rawTransaction,
        });

        console.log(
          'TRC10 Transaction Result:',
          JSON.stringify(result, null, 2),
        );

        const expectedTransaction = {
          account: 'test-trc10-account',
          type: 'send',
          id: 'd8fc96d5b81fe600e055741e27135e22d5ae42584c9056758f797b1a20328818',
          from: [
            {
              address: 'TFDP1vFeSYPT6FUznL7zUjhg5X7p2AA8vw',
              asset: {
                amount: '0.494',
                unit: 'UNKNOWN',
                type: 'tron:728126428/trc10:1002000',
                fungible: true,
              },
            },
          ],
          to: [
            {
              address: 'TKYT8YiiL58h8USHkmVEhCYpNfgSyiWPcW',
              asset: {
                amount: '0.494',
                unit: 'UNKNOWN',
                type: 'tron:728126428/trc10:1002000',
                fungible: true,
              },
            },
          ],
          chain: 'tron:728126428',
          status: 'confirmed',
          timestamp: 1756870677,
          events: [
            {
              status: 'confirmed',
              timestamp: 1756870677,
            },
          ],
          fees: [
            {
              asset: {
                amount: '281000',
                unit: 'TRX',
                type: 'tron:728126428/slip44:195',
                fungible: true,
              },
              type: 'base',
            },
          ],
        };

        expect(result).toStrictEqual(expectedTransaction);
      });
    });

    describe('TriggerSmartContract (TRC20 transfers)', () => {
      it('should map a TRC20 send transaction with assistance data correctly', () => {
        const rawTransaction = trc20TransferMock as TransactionInfo;
        const trc20AssistanceData = contractInfoMock
          .data[0] as ContractTransactionInfo;

        const result = TransactionMapper.mapTransaction({
          scope: Network.Mainnet,
          account: mockAccount,
          trongridTransaction: rawTransaction,
          trc20AssistanceData,
        });

        console.log(
          'TRC20 Transaction Result:',
          JSON.stringify(result, null, 2),
        );

        const expectedTransaction = {
          account: 'test-account-id',
          type: 'send',
          id: '35f3dcfede12f943827809ddc18b891f78c38337e2b80912f50bd52a054497aa',
          from: [
            {
              address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
              asset: {
                amount: '0.01',
                unit: 'USDT',
                type: 'tron:728126428/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
                fungible: true,
              },
            },
          ],
          to: [
            {
              address: 'TEFik7dGm6r5Y1Af9mGwnELuJLa1jXDDUB',
              asset: {
                amount: '0.01',
                unit: 'USDT',
                type: 'tron:728126428/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
                fungible: true,
              },
            },
          ],
          chain: 'tron:728126428',
          status: 'confirmed',
          timestamp: 1757590707,
          events: [
            {
              status: 'confirmed',
              timestamp: 1757590707,
            },
          ],
          fees: [
            {
              asset: {
                amount: '12987800',
                unit: 'TRX',
                type: 'tron:728126428/slip44:195',
                fungible: true,
              },
              type: 'base',
            },
            {
              asset: {
                amount: '345',
                unit: 'BANDWIDTH',
                type: 'tron:728126428/slip44:bandwidth',
                fungible: true,
              },
              type: 'base',
            },
            {
              asset: {
                amount: '407',
                unit: 'ENERGY',
                type: 'tron:728126428/slip44:energy',
                fungible: true,
              },
              type: 'base',
            },
          ],
        };

        expect(result).toStrictEqual(expectedTransaction);
      });

      it('should return null for TriggerSmartContract without assistance data', () => {
        const rawTransaction = trc20TransferMock as TransactionInfo;

        const result = TransactionMapper.mapTransaction({
          scope: Network.Mainnet,
          account: mockAccount,
          trongridTransaction: rawTransaction,
          // No trc20AssistanceData provided
        });

        console.log(
          'TriggerSmartContract without assistance data Result:',
          result,
        );
        expect(result).toBeNull();
      });
    });

    describe('Fee calculation', () => {
      it('should calculate TRX fees for native transfers', () => {
        const rawTransaction = nativeTransferMock as TransactionInfo;

        const result = TransactionMapper.mapTransaction({
          scope: Network.Mainnet,
          account: mockAccount,
          trongridTransaction: rawTransaction,
        });

        console.log('Native TRX fees:', JSON.stringify(result?.fees, null, 2));

        const expectedFees = [
          {
            asset: {
              amount: '266000',
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              fungible: true,
            },
            type: 'base',
          },
        ];

        expect(result?.fees).toStrictEqual(expectedFees);
      });

      it('should calculate comprehensive fees for TRC20 transfers', () => {
        const rawTransaction = trc20TransferMock as TransactionInfo;
        const trc20AssistanceData = contractInfoMock
          .data[0] as ContractTransactionInfo;

        const result = TransactionMapper.mapTransaction({
          scope: Network.Mainnet,
          account: mockAccount,
          trongridTransaction: rawTransaction,
          trc20AssistanceData,
        });

        console.log(
          'TRC20 comprehensive fees:',
          JSON.stringify(result?.fees, null, 2),
        );

        const expectedFees = [
          {
            asset: {
              amount: '12987800',
              unit: 'TRX',
              type: 'tron:728126428/slip44:195',
              fungible: true,
            },
            type: 'base',
          },
          {
            asset: {
              amount: '345',
              unit: 'BANDWIDTH',
              type: 'tron:728126428/slip44:bandwidth',
              fungible: true,
            },
            type: 'base',
          },
          {
            asset: {
              amount: '407',
              unit: 'ENERGY',
              type: 'tron:728126428/slip44:energy',
              fungible: true,
            },
            type: 'base',
          },
        ];

        expect(result?.fees).toStrictEqual(expectedFees);
      });
    });
  });

  describe('mapTransactions', () => {
    it('should map multiple different transaction types correctly', () => {
      const rawTransactions = [
        nativeTransferMock,
        trc10TransferMock,
        trc20TransferMock,
      ] as TransactionInfo[];
      const trc20AssistanceData =
        contractInfoMock.data as ContractTransactionInfo[];

      const result = TransactionMapper.mapTransactions({
        scope: Network.Mainnet,
        account: mockAccount,
        rawTransactions,
        trc20Transactions: trc20AssistanceData,
      });

      console.log(
        'Mapped multiple transaction types count:',
        result.filter((tx) => tx !== null).length,
      );
      console.log(
        'Sample mapped transactions:',
        JSON.stringify(
          result.filter((tx) => tx !== null),
          null,
          2,
        ),
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // All 3 transactions map successfully (native TRX + TRC10 + TRC20)
      expect(result.filter((tx) => tx !== null)).toHaveLength(3);
    });

    it('should handle empty input arrays', () => {
      const result = TransactionMapper.mapTransactions({
        scope: Network.Mainnet,
        account: mockAccount,
        rawTransactions: [],
        trc20Transactions: [],
      });

      console.log('Empty input result:', result);
      expect(result).toStrictEqual([]);
    });
  });

  describe('Edge cases', () => {
    it('should handle transaction with missing contract data', () => {
      const malformedTransaction = {
        txID: 'test-tx-id',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        raw_data: {
          contract: undefined,
        },
      } as any;

      const result = TransactionMapper.mapTransaction({
        scope: Network.Mainnet,
        account: mockAccount,
        trongridTransaction: malformedTransaction,
      });

      console.log('Malformed transaction result:', result);
      expect(result).toBeNull();
    });

    it('should return null for unsupported contract types', () => {
      const mockRawData = nativeTransferMock?.raw_data;
      const rawTransaction = {
        ...nativeTransferMock,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        raw_data: {
          ...mockRawData,
          contract: [
            {
              type: 'UnsupportedContract',
              parameter: {},
            },
          ],
        },
      } as any;

      const result = TransactionMapper.mapTransaction({
        scope: Network.Mainnet,
        account: mockAccount,
        trongridTransaction: rawTransaction,
      });

      console.log('Unsupported contract type result:', result);
      expect(result).toBeNull();
    });
  });

  describe('Network-specific behavior', () => {
    it('should work with different networks (Shasta)', () => {
      const rawTransaction = nativeTransferMock as TransactionInfo;

      const result = TransactionMapper.mapTransaction({
        scope: Network.Shasta, // Use Shasta instead of Mainnet
        account: mockAccount,
        trongridTransaction: rawTransaction,
      });

      console.log(
        'Shasta network transaction result:',
        JSON.stringify(result, null, 2),
      );

      const expectedTransaction = {
        account: 'test-account-id',
        type: 'send',
        id: '8145535b24f71bc592b8ab2d94e91a30d12f74ab33fa4aab2ff2a27b767fc49b',
        from: [
          {
            address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
            asset: {
              amount: '0.01',
              unit: 'TRX',
              type: 'tron:2494104990/slip44:195',
              fungible: true,
            },
          },
        ],
        to: [
          {
            address: 'TEFik7dGm6r5Y1Af9mGwnELuJLa1jXDDUB',
            asset: {
              amount: '0.01',
              unit: 'TRX',
              type: 'tron:2494104990/slip44:195',
              fungible: true,
            },
          },
        ],
        chain: 'tron:2494104990',
        status: 'confirmed',
        timestamp: 1756914747,
        events: [
          {
            status: 'confirmed',
            timestamp: 1756914747,
          },
        ],
        fees: [
          {
            asset: {
              amount: '266000',
              unit: 'TRX',
              type: 'tron:2494104990/slip44:195',
              fungible: true,
            },
            type: 'base',
          },
        ],
      };

      expect(result).toStrictEqual(expectedTransaction);
    });
  });
});
