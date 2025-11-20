// eslint-disable-file @typescript-eslint/no-non-null-assertion
import { TransactionType, TransactionStatus } from '@metamask/keyring-api';

import { TransactionMapper } from './TransactionsMapper';
import type {
  TransactionInfo,
  ContractTransactionInfo,
} from '../../clients/trongrid/types';
import { Network } from '../../constants';
import type { TronKeyringAccount } from '../../entities';
import contractInfoMock from './mocks/contract-info.json';
import failedTransactionMock from './mocks/failed-transaction.json';
import nativeTransferMock from './mocks/native-transfer.json';
import swapContractInfoMock from './mocks/swap-contract-info.json';
import swapTransactionMock from './mocks/swap-transaction.json';
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

        const expectedTransaction = {
          account: 'test-account-id',
          type: TransactionType.Send,
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
          status: TransactionStatus.Confirmed,
          timestamp: 1756914747,
          events: [
            {
              status: TransactionStatus.Confirmed,
              timestamp: 1756914747,
            },
          ],
          fees: [
            {
              asset: {
                amount: '0.266',
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

        const expectedTransaction = {
          account: 'test-trc10-account',
          type: TransactionType.Send,
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
          status: TransactionStatus.Confirmed,
          timestamp: 1756870677,
          events: [
            {
              status: TransactionStatus.Confirmed,
              timestamp: 1756870677,
            },
          ],
          fees: [
            {
              asset: {
                amount: '0.281',
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
        const trc20Transfers = [
          contractInfoMock.data[0] as ContractTransactionInfo,
        ];

        const result = TransactionMapper.mapTransaction({
          scope: Network.Mainnet,
          account: mockAccount,
          trongridTransaction: rawTransaction,
          trc20Transfers,
        });

        const expectedTransaction = {
          account: 'test-account-id',
          type: TransactionType.Send,
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
          status: TransactionStatus.Confirmed,
          timestamp: 1757590707,
          events: [
            {
              status: TransactionStatus.Confirmed,
              timestamp: 1757590707,
            },
          ],
          fees: [
            {
              asset: {
                amount: '12.9878',
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

      it('should return null for TriggerSmartContract without assistance data and no call_value', () => {
        const rawTransaction = trc20TransferMock as TransactionInfo;

        const result = TransactionMapper.mapTransaction({
          scope: Network.Mainnet,
          account: mockAccount,
          trongridTransaction: rawTransaction,
          // No trc20Transfers provided and no call_value
        });

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

        const expectedFees = [
          {
            asset: {
              amount: '0.266',
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
        const trc20Transfers = [
          contractInfoMock.data[0] as ContractTransactionInfo,
        ];

        const result = TransactionMapper.mapTransaction({
          scope: Network.Mainnet,
          account: mockAccount,
          trongridTransaction: rawTransaction,
          trc20Transfers,
        });

        const expectedFees = [
          {
            asset: {
              amount: '12.9878',
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

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // All transactions map successfully:
      // 3 raw transactions (native TRX + TRC10 + TRC20 send)
      // + 2 TRC20-only transactions (USDDOLD receive + USDT receive)
      expect(result.filter((tx) => tx !== null)).toHaveLength(5);
    });

    it('should handle empty input arrays', () => {
      const result = TransactionMapper.mapTransactions({
        scope: Network.Mainnet,
        account: mockAccount,
        rawTransactions: [],
        trc20Transactions: [],
      });

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
        status: TransactionStatus.Confirmed,
        timestamp: 1756914747,
        events: [
          {
            status: TransactionStatus.Confirmed,
            timestamp: 1756914747,
          },
        ],
        fees: [
          {
            asset: {
              amount: '0.266',
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

  describe('Failed Transactions', () => {
    it('maps a failed TriggerSmartContract transaction (OUT_OF_ENERGY) without TRC20 data', () => {
      const failedTx = failedTransactionMock as unknown as TransactionInfo;

      const result = TransactionMapper.mapTransaction({
        scope: Network.Mainnet,
        account: mockAccount,
        trongridTransaction: failedTx,
        trc20Transfers: [],
      });

      expect(result).not.toBeNull();
      expect(result?.status).toStrictEqual(TransactionStatus.Failed);
      expect(result?.type).toStrictEqual(TransactionType.Unknown);
      expect(result?.from).toStrictEqual([]);
      expect(result?.to).toStrictEqual([]);
      expect(result?.fees).toBeDefined();
    });
  });

  describe('Swap Transactions', () => {
    it('maps a TRX → TRC20 swap transaction correctly', () => {
      const swapTx = swapTransactionMock as unknown as TransactionInfo;
      const trc20Transfers =
        swapContractInfoMock.data as unknown as ContractTransactionInfo[];

      const result = TransactionMapper.mapTransaction({
        scope: Network.Mainnet,
        account: mockAccount,
        trongridTransaction: swapTx,
        trc20Transfers,
      });

      expect(result).not.toBeNull();
      expect(result?.type).toStrictEqual(TransactionType.Swap);
      expect(result?.status).toStrictEqual(TransactionStatus.Confirmed);

      // Check TRX → USDT swap
      expect(result?.from[0]?.asset).toHaveProperty('unit', 'TRX');
      expect(result?.from[0]?.asset).toHaveProperty('amount', '10');
      expect(result?.to[0]?.asset).toHaveProperty('unit', 'USDT');
    });

    it('maps a TRC20 ↔ TRC20 swap transaction correctly', () => {
      const mockTrc20Swap = {
        ...swapTransactionMock,
      } as unknown as TransactionInfo;

      /* eslint-disable @typescript-eslint/naming-convention */
      const trc20Transfers: ContractTransactionInfo[] = [
        {
          transaction_id: mockTrc20Swap.txID,
          token_info: {
            symbol: 'USDT',
            address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
            decimals: 6,
            name: 'Tether USD',
          },
          block_timestamp: 1632825600000,
          from: mockAccount.address,
          to: 'TContractAddress',
          type: 'Transfer',
          value: '100000000',
        },
        {
          transaction_id: mockTrc20Swap.txID,
          token_info: {
            symbol: 'USDC',
            address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
            decimals: 6,
            name: 'USD Coin',
          },
          block_timestamp: 1632825600000,
          from: 'TContractAddress',
          to: mockAccount.address,
          type: 'Transfer',
          value: '99500000',
        },
      ];
      /* eslint-enable @typescript-eslint/naming-convention */

      const result = TransactionMapper.mapTransaction({
        scope: Network.Mainnet,
        account: mockAccount,
        trongridTransaction: mockTrc20Swap,
        trc20Transfers,
      });

      expect(result).not.toBeNull();
      expect(result?.type).toStrictEqual(TransactionType.Swap);
      expect(result?.from[0]?.asset).toHaveProperty('unit', 'USDT');
      expect(result?.from[0]?.asset).toHaveProperty('amount', '100');
      expect(result?.to[0]?.asset).toHaveProperty('unit', 'USDC');
      expect(result?.to[0]?.asset).toHaveProperty('amount', '99.5');
    });
  });

  describe('Non-Swap Scenarios', () => {
    it('does not detect a swap when only receiving TRC20 (no TRX movement)', () => {
      /* eslint-disable @typescript-eslint/naming-convention */
      const mockTx = {
        ...swapTransactionMock,
        internal_transactions: [],
      } as unknown as TransactionInfo;

      const trc20Transfers: ContractTransactionInfo[] = [
        {
          transaction_id: mockTx.txID,
          token_info: {
            symbol: 'USDT',
            address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
            decimals: 6,
            name: 'Tether USD',
          },
          block_timestamp: 1632825600000,
          from: 'TSomeOtherAddress',
          to: mockAccount.address,
          type: 'Transfer',
          value: '50000000',
        },
      ];
      /* eslint-enable @typescript-eslint/naming-convention */

      const result = TransactionMapper.mapTransaction({
        scope: Network.Mainnet,
        account: mockAccount,
        trongridTransaction: mockTx,
        trc20Transfers,
      });

      expect(result).not.toBeNull();
      expect(result?.type).toStrictEqual(TransactionType.Receive);
    });

    it('does not detect a swap when only sending TRC20', () => {
      /* eslint-disable @typescript-eslint/naming-convention */
      const mockTx = {
        ...swapTransactionMock,
        internal_transactions: [],
      } as unknown as TransactionInfo;

      const trc20Transfers: ContractTransactionInfo[] = [
        {
          transaction_id: mockTx.txID,
          token_info: {
            symbol: 'USDT',
            address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
            decimals: 6,
            name: 'Tether USD',
          },
          block_timestamp: 1632825600000,
          from: mockAccount.address,
          to: 'TSomeOtherAddress',
          type: 'Transfer',
          value: '50000000',
        },
      ];
      /* eslint-enable @typescript-eslint/naming-convention */

      const result = TransactionMapper.mapTransaction({
        scope: Network.Mainnet,
        account: mockAccount,
        trongridTransaction: mockTx,
        trc20Transfers,
      });

      expect(result).not.toBeNull();
      expect(result?.type).toStrictEqual(TransactionType.Send);
    });

    it('does not detect a swap when sending and receiving the same token (send to self)', () => {
      /* eslint-disable @typescript-eslint/naming-convention */
      const mockTx = {
        ...swapTransactionMock,
      } as unknown as TransactionInfo;

      const trc20Transfers: ContractTransactionInfo[] = [
        {
          transaction_id: mockTx.txID,
          token_info: {
            symbol: 'USDT',
            address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
            decimals: 6,
            name: 'Tether USD',
          },
          block_timestamp: 1632825600000,
          from: mockAccount.address,
          to: 'TContract',
          type: 'Transfer',
          value: '100000000',
        },
        {
          transaction_id: mockTx.txID,
          token_info: {
            symbol: 'USDT',
            address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
            decimals: 6,
            name: 'Tether USD',
          },
          block_timestamp: 1632825600000,
          from: 'TContract',
          to: mockAccount.address,
          type: 'Transfer',
          value: '100000000',
        },
      ];
      /* eslint-enable @typescript-eslint/naming-convention */

      const result = TransactionMapper.mapTransaction({
        scope: Network.Mainnet,
        account: mockAccount,
        trongridTransaction: mockTx,
        trc20Transfers,
      });

      expect(result).not.toBeNull();
      expect(result?.type).not.toStrictEqual(TransactionType.Swap);
    });

    it('does not detect TRX swap when there are no internal transactions', () => {
      /* eslint-disable @typescript-eslint/naming-convention */
      const mockTx = {
        ...swapTransactionMock,
        internal_transactions: [],
      } as unknown as TransactionInfo;

      const trc20Transfers: ContractTransactionInfo[] = [
        {
          transaction_id: mockTx.txID,
          token_info: {
            symbol: 'USDT',
            address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
            decimals: 6,
            name: 'Tether USD',
          },
          block_timestamp: 1632825600000,
          from: 'TContract',
          to: mockAccount.address,
          type: 'Transfer',
          value: '50000000',
        },
      ];
      /* eslint-enable @typescript-eslint/naming-convention */

      const result = TransactionMapper.mapTransaction({
        scope: Network.Mainnet,
        account: mockAccount,
        trongridTransaction: mockTx,
        trc20Transfers,
      });

      expect(result).not.toBeNull();
      expect(result?.type).toStrictEqual(TransactionType.Receive);
    });

    it('handles TRX movements with zero callValue correctly', () => {
      /* eslint-disable @typescript-eslint/naming-convention */
      const mockTx = {
        ...swapTransactionMock,
        internal_transactions: [
          {
            from_address: mockAccount.address.toLowerCase(),
            to_address: 'TContractAddress',
            data: {
              call_value: { _: 0 },
              note: '',
              rejected: false,
            },
            internal_tx_id: 'internal-0',
          },
        ],
      } as unknown as TransactionInfo;

      const trc20Transfers: ContractTransactionInfo[] = [
        {
          transaction_id: mockTx.txID,
          token_info: {
            symbol: 'USDT',
            address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
            decimals: 6,
            name: 'Tether USD',
          },
          block_timestamp: 1632825600000,
          from: 'TContract',
          to: mockAccount.address,
          type: 'Transfer',
          value: '50000000',
        },
      ];
      /* eslint-enable @typescript-eslint/naming-convention */

      const result = TransactionMapper.mapTransaction({
        scope: Network.Mainnet,
        account: mockAccount,
        trongridTransaction: mockTx,
        trc20Transfers,
      });

      expect(result).not.toBeNull();
      expect(result?.type).toStrictEqual(TransactionType.Receive);
    });
  });

  describe('TRC20-Only Transactions', () => {
    it('maps TRC20-only transactions in mapTransactions', () => {
      const rawTransactions: TransactionInfo[] = [
        nativeTransferMock,
        trc10TransferMock,
        trc20TransferMock,
      ] as TransactionInfo[];

      /* eslint-disable @typescript-eslint/naming-convention */
      const trc20Transactions = [
        ...contractInfoMock.data,
        {
          transaction_id: 'trc20-only-tx-id',
          token_info: {
            symbol: 'AIRDROP',
            address: 'TAirdropTokenAddress',
            decimals: 18,
            name: 'Airdrop Token',
          },
          block_timestamp: 1632825600000,
          from: 'TSomeContract',
          to: mockAccount.address,
          type: 'Transfer',
          value: '1000000000000000000',
        },
      ] as ContractTransactionInfo[];
      /* eslint-enable @typescript-eslint/naming-convention */

      const result = TransactionMapper.mapTransactions({
        scope: Network.Mainnet,
        account: mockAccount,
        rawTransactions,
        trc20Transactions,
      });

      // 3 raw transactions (native TRX + TRC10 + TRC20 send)
      // + 3 TRC20-only (USDDOLD receive + USDT receive + airdrop)
      expect(result).toHaveLength(6);
      const airdropTx = result.find((tx) => tx.id === 'trc20-only-tx-id');
      expect(airdropTx).toBeDefined();
      expect(airdropTx?.type).toStrictEqual(TransactionType.Receive);
      expect(airdropTx?.from[0]?.asset).toHaveProperty('unit', 'AIRDROP');
      expect(airdropTx?.from[0]?.asset).toHaveProperty('amount', '1');
    });
  });

  describe('TRX-Only Contract Interactions', () => {
    it('maps a TriggerSmartContract with TRX call_value but no TRC20 data', () => {
      /* eslint-disable @typescript-eslint/naming-convention */
      const mockTrxOnlyContract = {
        ...trc20TransferMock,
        raw_data: {
          ...trc20TransferMock.raw_data,
          contract: [
            {
              ...trc20TransferMock.raw_data.contract[0],
              parameter: {
                ...trc20TransferMock.raw_data.contract[0]?.parameter,
                value: {
                  owner_address: '41bace09b0c75ff01da2cb86cf05bc0d6d1af21f5d',
                  contract_address:
                    '41a614f803b6fd780986a42c78ec9c7f77e6ded13c',
                  call_value: 50000000, // 50 TRX
                  data: '0x',
                },
              },
            },
          ],
        },
      } as unknown as TransactionInfo;
      /* eslint-enable @typescript-eslint/naming-convention */

      const result = TransactionMapper.mapTransaction({
        scope: Network.Mainnet,
        account: mockAccount,
        trongridTransaction: mockTrxOnlyContract,
        trc20Transfers: [],
      });

      expect(result).not.toBeNull();
      expect(result?.type).toStrictEqual(TransactionType.Send);
      expect(result?.from[0]?.asset).toBeDefined();
      expect(result?.from[0]?.asset).toHaveProperty('unit', 'TRX');
      expect(result?.from[0]?.asset).toHaveProperty('amount', '50');
      expect(result?.to[0]?.asset).toBeDefined();
      expect(result?.to[0]?.asset).toHaveProperty('unit', 'TRX');
    });
  });
});
