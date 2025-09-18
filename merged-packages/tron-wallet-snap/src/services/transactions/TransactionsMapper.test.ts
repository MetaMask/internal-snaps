import { TransactionMapper } from './TransactionsMapper';
import type {
  TransactionInfo,
  ContractTransactionInfo,
} from '../../clients/trongrid/types';
import { Network } from '../../constants';
import type { TronKeyringAccount } from '../../entities';

// Import simplified mock data (each file now contains only one transaction)
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
    scopes: ['tron:mainnet'],
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

        expect(result).toBeDefined();
        expect(result).not.toBeNull();
        expect(result!.type).toBe('send');
        expect(result!.id).toBe(
          '8145535b24f71bc592b8ab2d94e91a30d12f74ab33fa4aab2ff2a27b767fc49b',
        );
        expect(result!.from).toHaveLength(1);
        expect(result!.from[0]?.address).toBe(
          'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
        );
        expect((result!.from[0]?.asset as any)?.amount).toBe('0.01');
        expect((result!.from[0]?.asset as any)?.unit).toBe('TRX');
        expect((result!.from[0]?.asset as any)?.type).toBe(
          'tron:728126428/slip44:195',
        );
        expect(result!.to).toHaveLength(1);
        expect(result!.to[0]?.address).toBe(
          'TEFik7dGm6r5Y1Af9mGwnELuJLa1jXDDUB',
        );
        expect(result!.chain).toBe('tron:728126428');
        expect(result!.status).toBe('confirmed');
        expect(result!.fees).toHaveLength(1);
        expect((result!.fees[0]?.asset as any)?.amount).toBe('532000'); // Actual fee from mock
        expect((result!.fees[0]?.asset as any)?.unit).toBe('TRX');
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

        expect(result).toBeDefined();
        expect(result).not.toBeNull();
        expect(result!.type).toBe('send');
        expect(result!.id).toBe(
          'd8fc96d5b81fe600e055741e27135e22d5ae42584c9056758f797b1a20328818',
        );
        expect(result!.from).toHaveLength(1);
        expect(result!.from[0]?.address).toBe(
          'TFDP1vFeSYPT6FUznL7zUjhg5X7p2AA8vw',
        );
        expect((result!.from[0]?.asset as any)?.amount).toBe('0.494');
        expect((result!.from[0]?.asset as any)?.unit).toBe('UNKNOWN');
        expect((result!.from[0]?.asset as any)?.type).toBe(
          'tron:728126428/trc10:1002000',
        );
        expect(result!.to).toHaveLength(1);
        expect(result!.chain).toBe('tron:728126428');
        expect(result!.status).toBe('confirmed');
        expect(result!.fees).toHaveLength(1);
        expect((result!.fees[0]?.asset as any)?.amount).toBe('562000'); // Actual TRC10 fee
        expect((result!.fees[0]?.asset as any)?.unit).toBe('TRX');
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

        expect(result).toBeDefined();
        expect(result).not.toBeNull();
        expect(result!.type).toBe('send');
        expect(result!.id).toBe(
          '35f3dcfede12f943827809ddc18b891f78c38337e2b80912f50bd52a054497aa',
        );
        expect(result!.from).toHaveLength(1);
        expect(result!.from[0]?.address).toBe(
          'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
        );
        expect((result!.from[0]?.asset as any)?.amount).toBe('0.01');
        expect((result!.from[0]?.asset as any)?.unit).toBe('USDT');
        expect((result!.from[0]?.asset as any)?.type).toBe(
          'tron:728126428/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        );
        expect(result!.to).toHaveLength(1);
        expect(result!.to[0]?.address).toBe(
          'TEFik7dGm6r5Y1Af9mGwnELuJLa1jXDDUB',
        );
        expect(result!.chain).toBe('tron:728126428');
        expect(result!.status).toBe('confirmed');
        // Comprehensive fee structure: TRX fee + Bandwidth + Energy
        expect(result!.fees).toHaveLength(3);
        expect((result!.fees[0]?.asset as any)?.amount).toBe('25975600'); // Actual TRC20 TRX fee
        expect((result!.fees[0]?.asset as any)?.unit).toBe('TRX');
        expect((result!.fees[1]?.asset as any)?.unit).toBe('BANDWIDTH');
        expect((result!.fees[1]?.asset as any)?.amount).toBe('345');
        expect((result!.fees[2]?.asset as any)?.unit).toBe('ENERGY');
        expect((result!.fees[2]?.asset as any)?.amount).toBe('130285'); // Actual energy usage from console
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
        expect(result).not.toBeNull();
        expect(result?.fees).toBeDefined();
        expect(result?.fees).toHaveLength(1);
        expect((result?.fees[0]?.asset as any)?.amount).toBe('532000'); // Actual net_fee from mock
        expect((result?.fees[0]?.asset as any)?.unit).toBe('TRX');
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
        expect(result).not.toBeNull();
        expect(result?.fees).toBeDefined();
        expect(result?.fees).toHaveLength(3);

        // TRX fee
        expect((result?.fees[0]?.asset as any)?.amount).toBe('25975600'); // Actual TRC20 fee
        expect((result?.fees[0]?.asset as any)?.unit).toBe('TRX');

        // Bandwidth fee
        expect((result?.fees[1]?.asset as any)?.amount).toBe('345');
        expect((result?.fees[1]?.asset as any)?.unit).toBe('BANDWIDTH');

        // Energy fee
        expect((result?.fees[2]?.asset as any)?.amount).toBe('130285'); // Actual energy from console
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
      expect(result).toEqual([]);
    });
  });

  describe('Edge cases', () => {
    it('should handle transaction with missing contract data', () => {
      const malformedTransaction = {
        txID: 'test-tx-id',
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

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.chain).toBe('tron:2494104990'); // Shasta chain ID
      expect((result!.from[0]?.asset as any)?.type).toBe(
        'tron:2494104990/slip44:195',
      );
      expect((result!.to[0]?.asset as any)?.type).toBe(
        'tron:2494104990/slip44:195',
      );
    });
  });
});
