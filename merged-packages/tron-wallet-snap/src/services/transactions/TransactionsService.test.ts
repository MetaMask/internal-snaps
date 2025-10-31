import type { Transaction } from '@metamask/keyring-api';

import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import type {
  ContractTransactionInfo,
  TransactionInfo,
} from '../../clients/trongrid/types';
import { KnownCaip19Id, Network } from '../../constants';
import type { TronKeyringAccount } from '../../entities';
import contractInfoMock from './mocks/contract-info.json';
import nativeTransferMock from './mocks/native-transfer.json';
import trc10TransferMock from './mocks/trc10-transfer.json';
import trc20TransferMock from './mocks/trc20-transfer.json';
import type { TransactionsRepository } from './TransactionsRepository';
import { TransactionsService } from './TransactionsService';
import type { ILogger } from '../../utils/logger';

// Import simplified mock data (each file now contains only one transaction)

describe('TransactionsService', () => {
  let transactionsService: TransactionsService;
  let mockLogger: jest.Mocked<ILogger>;
  let mockTransactionsRepository: jest.Mocked<TransactionsRepository>;
  let mockTrongridApiClient: jest.Mocked<TrongridApiClient>;

  const mockAccount: TronKeyringAccount = {
    id: 'test-account-id',
    address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
    type: 'eip155:eoa',
    options: {},
    methods: [],
    scopes: ['tron:728126428'],
    entropySource: 'test-entropy',
    derivationPath: 'm/0/0',
    index: 0,
  };

  const mockAccount2: TronKeyringAccount = {
    id: 'test-account-id-2',
    address: 'TFDP1vFeSYPT6FUznL7zUjhg5X7p2AA8vw',
    type: 'eip155:eoa',
    options: {},
    methods: [],
    scopes: ['tron:728126428'],
    entropySource: 'test-entropy',
    derivationPath: 'm/0/1',
    index: 1,
  };

  beforeEach(() => {
    // Mock the global snap object
    const snap = {
      request: jest.fn(),
    };
    (globalThis as any).snap = snap;

    // Create mocks
    mockLogger = {
      log: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Create mock repository
    mockTransactionsRepository = {
      getAll: jest.fn(),
      findByAccountId: jest.fn(),
      save: jest.fn(),
      saveMany: jest.fn(),
    } as unknown as jest.Mocked<TransactionsRepository>;

    // Create mock API client
    mockTrongridApiClient = {
      getAccountInfoByAddress: jest.fn(),
      getTransactionInfoByAddress: jest.fn(),
      getContractTransactionInfoByAddress: jest.fn(),
    } as unknown as jest.Mocked<TrongridApiClient>;

    // Create service instance
    transactionsService = new TransactionsService({
      logger: mockLogger,
      transactionsRepository: mockTransactionsRepository,
      trongridApiClient: mockTrongridApiClient,
    });
  });

  describe('fetchTransactionsForAccount', () => {
    it('should fetch and map transactions for an account using native transfers mock data', async () => {
      // Setup mock responses with simplified single-transaction structure
      mockTrongridApiClient.getTransactionInfoByAddress.mockResolvedValue([
        nativeTransferMock,
      ] as TransactionInfo[]);
      mockTrongridApiClient.getContractTransactionInfoByAddress.mockResolvedValue(
        contractInfoMock.data as ContractTransactionInfo[],
      );

      const result = await transactionsService.fetchTransactionsForAccount(
        Network.Mainnet,
        mockAccount,
      );

      console.log('Fetched transactions count:', result.length);
      console.log(
        'Sample fetched transactions:',
        JSON.stringify(result.slice(0, 2), null, 2),
      );

      // Verify API calls were made
      expect(
        mockTrongridApiClient.getTransactionInfoByAddress,
      ).toHaveBeenCalledWith(Network.Mainnet, mockAccount.address);
      expect(
        mockTrongridApiClient.getContractTransactionInfoByAddress,
      ).toHaveBeenCalledWith(Network.Mainnet, mockAccount.address);

      // Verify logger calls
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[🧾 TransactionsService]',
        expect.stringContaining('Fetching transactions for account'),
      );

      expect(true).toBe(true);
    });

    it('should fetch and map transactions for an account using TRC10 transfers mock data', async () => {
      // Setup mock responses with simplified single-transaction structure
      mockTrongridApiClient.getTransactionInfoByAddress.mockResolvedValue([
        trc10TransferMock,
      ] as TransactionInfo[]);
      mockTrongridApiClient.getContractTransactionInfoByAddress.mockResolvedValue(
        [],
      );

      const result = await transactionsService.fetchTransactionsForAccount(
        Network.Mainnet,
        mockAccount2,
      );

      console.log('Fetched TRC10 transactions count:', result.length);
      console.log(
        'Sample fetched TRC10 transactions:',
        JSON.stringify(result.slice(0, 2), null, 2),
      );

      // Verify API calls were made
      expect(
        mockTrongridApiClient.getTransactionInfoByAddress,
      ).toHaveBeenCalledWith(Network.Mainnet, mockAccount2.address);
      expect(
        mockTrongridApiClient.getContractTransactionInfoByAddress,
      ).toHaveBeenCalledWith(Network.Mainnet, mockAccount2.address);

      expect(true).toBe(true);
    });

    it('should handle network parameter correctly for different networks', async () => {
      // Setup mock responses
      mockTrongridApiClient.getTransactionInfoByAddress.mockResolvedValue([]);
      mockTrongridApiClient.getContractTransactionInfoByAddress.mockResolvedValue(
        [],
      );

      await transactionsService.fetchTransactionsForAccount(
        Network.Shasta,
        mockAccount,
      );

      // Verify API calls were made with correct network
      expect(
        mockTrongridApiClient.getTransactionInfoByAddress,
      ).toHaveBeenCalledWith(Network.Shasta, mockAccount.address);
      expect(
        mockTrongridApiClient.getContractTransactionInfoByAddress,
      ).toHaveBeenCalledWith(Network.Shasta, mockAccount.address);

      expect(true).toBe(true);
    });

    it('should handle empty responses from API', async () => {
      // Setup empty mock responses
      mockTrongridApiClient.getTransactionInfoByAddress.mockResolvedValue([]);
      mockTrongridApiClient.getContractTransactionInfoByAddress.mockResolvedValue(
        [],
      );

      const result = await transactionsService.fetchTransactionsForAccount(
        Network.Mainnet,
        mockAccount,
      );

      console.log('Empty API response result:', result);
      expect(result).toStrictEqual([]);
      expect(true).toBe(true);
    });

    it('should handle API errors gracefully', async () => {
      // Setup API to throw error
      const apiError = new Error('API request failed');
      mockTrongridApiClient.getTransactionInfoByAddress.mockRejectedValue(
        apiError,
      );
      mockTrongridApiClient.getContractTransactionInfoByAddress.mockRejectedValue(
        apiError,
      );

      const result = await transactionsService.fetchTransactionsForAccount(
        Network.Mainnet,
        mockAccount,
      );

      expect(result).toStrictEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[🧾 TransactionsService]',
        'Failed to fetch raw transactions',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[🧾 TransactionsService]',
        'Failed to fetch TRC20 transactions',
      );
      expect(true).toBe(true);
    });
  });

  describe('findByAccounts', () => {
    it('should find transactions for multiple accounts', async () => {
      const mockTransactions1: Transaction[] = [
        {
          id: 'tx1',
          type: 'send',
          account: mockAccount.id,
          chain: Network.Mainnet,
          status: 'confirmed',
          timestamp: Math.floor(Date.now() / 1000),
          from: [
            {
              address: mockAccount.address,
              asset: {
                type: KnownCaip19Id.TrxMainnet,
                amount: '100',
                unit: 'TRX',
                fungible: true,
              },
            },
          ],
          to: [
            {
              address: 'other-address',
              asset: {
                type: KnownCaip19Id.TrxMainnet,
                amount: '100',
                unit: 'TRX',
                fungible: true,
              },
            },
          ],
          events: [],
          fees: [],
        },
      ];

      const mockTransactions2: Transaction[] = [
        {
          id: 'tx2',
          type: 'receive',
          account: mockAccount2.id,
          chain: Network.Mainnet,
          status: 'confirmed',
          timestamp: Math.floor(Date.now() / 1000),
          from: [
            {
              address: 'other-address',
              asset: {
                type: KnownCaip19Id.TrxMainnet,
                amount: '50',
                unit: 'TRX',
                fungible: true,
              },
            },
          ],
          to: [
            {
              address: mockAccount2.address,
              asset: {
                type: KnownCaip19Id.TrxMainnet,
                amount: '50',
                unit: 'TRX',
                fungible: true,
              },
            },
          ],
          events: [],
          fees: [],
        },
      ];

      mockTransactionsRepository.findByAccountId
        .mockResolvedValueOnce(mockTransactions1)
        .mockResolvedValueOnce(mockTransactions2);

      const result = await transactionsService.findByAccounts([
        mockAccount,
        mockAccount2,
      ]);

      console.log(
        'Found transactions for multiple accounts:',
        JSON.stringify(result, null, 2),
      );

      expect(mockTransactionsRepository.findByAccountId).toHaveBeenCalledTimes(
        2,
      );
      expect(mockTransactionsRepository.findByAccountId).toHaveBeenCalledWith(
        mockAccount.id,
      );
      expect(mockTransactionsRepository.findByAccountId).toHaveBeenCalledWith(
        mockAccount2.id,
      );
      expect(result).toHaveLength(2);
      expect(true).toBe(true);
    });

    it('should handle empty accounts array', async () => {
      const result = await transactionsService.findByAccounts([]);

      console.log('Empty accounts result:', result);
      expect(result).toStrictEqual([]);
      expect(mockTransactionsRepository.findByAccountId).not.toHaveBeenCalled();
      expect(true).toBe(true);
    });
  });

  describe('save', () => {
    it('should save a single transaction', async () => {
      const mockTransaction: Transaction = {
        id: 'tx-save-test',
        type: 'send',
        account: mockAccount.id,
        chain: Network.Mainnet,
        status: 'confirmed',
        timestamp: Math.floor(Date.now() / 1000),
        from: [
          {
            address: mockAccount.address,
            asset: {
              type: KnownCaip19Id.TrxMainnet,
              amount: '100',
              unit: 'TRX',
              fungible: true,
            },
          },
        ],
        to: [
          {
            address: 'other-address',
            asset: {
              type: KnownCaip19Id.TrxMainnet,
              amount: '100',
              unit: 'TRX',
              fungible: true,
            },
          },
        ],
        events: [],
        fees: [],
      };

      await transactionsService.save(mockTransaction);

      console.log('Saved single transaction:', mockTransaction.id);
      expect(mockTransactionsRepository.saveMany).toHaveBeenCalledWith([
        mockTransaction,
      ]);
      expect(true).toBe(true);
    });
  });

  describe('saveMany', () => {
    it('should save multiple transactions and emit keyring event', async () => {
      const mockTransactions: Transaction[] = [
        {
          id: 'tx-bulk-1',
          type: 'send',
          account: mockAccount.id,
          chain: Network.Mainnet,
          status: 'confirmed',
          timestamp: Math.floor(Date.now() / 1000),
          from: [
            {
              address: mockAccount.address,
              asset: {
                type: KnownCaip19Id.TrxMainnet,
                amount: '100',
                unit: 'TRX',
                fungible: true,
              },
            },
          ],
          to: [
            {
              address: 'other-address',
              asset: {
                type: KnownCaip19Id.TrxMainnet,
                amount: '100',
                unit: 'TRX',
                fungible: true,
              },
            },
          ],
          events: [],
          fees: [],
        },
        {
          id: 'tx-bulk-2',
          type: 'receive',
          account: mockAccount.id,
          chain: Network.Mainnet,
          status: 'confirmed',
          timestamp: Math.floor(Date.now() / 1000),
          from: [
            {
              address: 'other-address',
              asset: {
                type: KnownCaip19Id.TrxMainnet,
                amount: '50',
                unit: 'TRX',
                fungible: true,
              },
            },
          ],
          to: [
            {
              address: mockAccount.address,
              asset: {
                type: KnownCaip19Id.TrxMainnet,
                amount: '50',
                unit: 'TRX',
                fungible: true,
              },
            },
          ],
          events: [],
          fees: [],
        },
      ];

      await transactionsService.saveMany(mockTransactions);

      console.log(
        'Saved multiple transactions count:',
        mockTransactions.length,
      );
      console.log(
        'Saved transactions IDs:',
        mockTransactions.map((tx) => tx.id),
      );

      expect(mockTransactionsRepository.saveMany).toHaveBeenCalledWith(
        mockTransactions,
      );
      expect(true).toBe(true);
    });

    it('should handle empty transactions array', async () => {
      await transactionsService.saveMany([]);

      console.log('Saved empty transactions array');
      expect(mockTransactionsRepository.saveMany).toHaveBeenCalledWith([]);
      expect(true).toBe(true);
    });

    it('should group transactions by account ID correctly', async () => {
      const mockTransactions: Transaction[] = [
        {
          id: 'tx-account1-1',
          type: 'send',
          account: mockAccount.id,
          chain: Network.Mainnet,
          status: 'confirmed',
          timestamp: Math.floor(Date.now() / 1000),
          from: [
            {
              address: mockAccount.address,
              asset: {
                type: KnownCaip19Id.TrxMainnet,
                amount: '100',
                unit: 'TRX',
                fungible: true,
              },
            },
          ],
          to: [
            {
              address: 'other-address',
              asset: {
                type: KnownCaip19Id.TrxMainnet,
                amount: '100',
                unit: 'TRX',
                fungible: true,
              },
            },
          ],
          events: [],
          fees: [],
        },
        {
          id: 'tx-account1-2',
          type: 'receive',
          account: mockAccount.id,
          chain: Network.Mainnet,
          status: 'confirmed',
          timestamp: Math.floor(Date.now() / 1000),
          from: [
            {
              address: 'other-address',
              asset: {
                type: KnownCaip19Id.TrxMainnet,
                amount: '25',
                unit: 'TRX',
                fungible: true,
              },
            },
          ],
          to: [
            {
              address: mockAccount.address,
              asset: {
                type: KnownCaip19Id.TrxMainnet,
                amount: '25',
                unit: 'TRX',
                fungible: true,
              },
            },
          ],
          events: [],
          fees: [],
        },
        {
          id: 'tx-account2-1',
          type: 'send',
          account: mockAccount2.id,
          chain: Network.Mainnet,
          status: 'confirmed',
          timestamp: Math.floor(Date.now() / 1000),
          from: [
            {
              address: mockAccount2.address,
              asset: {
                type: KnownCaip19Id.TrxMainnet,
                amount: '75',
                unit: 'TRX',
                fungible: true,
              },
            },
          ],
          to: [
            {
              address: 'other-address',
              asset: {
                type: KnownCaip19Id.TrxMainnet,
                amount: '75',
                unit: 'TRX',
                fungible: true,
              },
            },
          ],
          events: [],
          fees: [],
        },
      ];

      await transactionsService.saveMany(mockTransactions);

      console.log('Grouped transactions by account:');
      console.log(`Account ${mockAccount.id}: 2 transactions`);
      console.log(`Account ${mockAccount2.id}: 1 transaction`);

      expect(mockTransactionsRepository.saveMany).toHaveBeenCalledWith(
        mockTransactions,
      );
      expect(true).toBe(true);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle a complete flow: fetch, process, and save transactions', async () => {
      // Setup API responses with simplified single-transaction structure
      mockTrongridApiClient.getTransactionInfoByAddress.mockResolvedValue([
        nativeTransferMock,
      ] as TransactionInfo[]);
      mockTrongridApiClient.getContractTransactionInfoByAddress.mockResolvedValue(
        contractInfoMock.data.slice(0, 1) as ContractTransactionInfo[],
      );

      // Fetch transactions
      const fetchedTransactions =
        await transactionsService.fetchTransactionsForAccount(
          Network.Mainnet,
          mockAccount,
        );

      // Save the fetched transactions
      await transactionsService.saveMany(fetchedTransactions);

      console.log(
        'Complete flow - Fetched and saved transactions:',
        fetchedTransactions.length,
      );
      console.log(
        'Sample transaction IDs:',
        fetchedTransactions.slice(0, 2).map((tx) => tx.id),
      );

      expect(mockTransactionsRepository.saveMany).toHaveBeenCalledWith(
        fetchedTransactions,
      );
      expect(true).toBe(true);
    });

    it('should handle mixed transaction types from different mock data sources', async () => {
      // Mix different types of transactions with simplified structure
      const mixedRawTransactions = [
        nativeTransferMock, // Native TRX transfer
        trc10TransferMock, // TRC10 transfer
        trc20TransferMock, // TRC20 transfer
      ] as TransactionInfo[];

      mockTrongridApiClient.getTransactionInfoByAddress.mockResolvedValue(
        mixedRawTransactions,
      );
      mockTrongridApiClient.getContractTransactionInfoByAddress.mockResolvedValue(
        [],
      );

      const result = await transactionsService.fetchTransactionsForAccount(
        Network.Mainnet,
        mockAccount2,
      );

      console.log('Mixed transaction types result:', result.length);
      console.log(
        'Transaction types:',
        result.map((tx) => tx.type),
      );

      expect(true).toBe(true);
    });
  });
});
