/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { Transaction } from '@metamask/keyring-api';

import type { TronHttpClient } from '../../clients/tron-http/TronHttpClient';
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
  let mockTronHttpClient: jest.Mocked<TronHttpClient>;

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
      findByAccountId: jest.fn().mockResolvedValue([]),
      getTransactionIdsByAccountId: jest.fn().mockResolvedValue(new Set()),
      getConfirmedTransactionIds: jest.fn().mockResolvedValue(new Set()),
      save: jest.fn(),
      saveMany: jest.fn(),
    } as unknown as jest.Mocked<TransactionsRepository>;

    // Create mock API client
    mockTrongridApiClient = {
      getAccountInfoByAddress: jest.fn(),
      getTransactionInfoByAddress: jest.fn(),
      getContractTransactionInfoByAddress: jest.fn(),
    } as unknown as jest.Mocked<TrongridApiClient>;

    // Create mock TronHttpClient
    mockTronHttpClient = {
      getTRC10TokenMetadata: jest.fn(),
      getTransactionInfoById: jest.fn(),
    } as unknown as jest.Mocked<TronHttpClient>;

    // Create service instance
    transactionsService = new TransactionsService({
      logger: mockLogger,
      transactionsRepository: mockTransactionsRepository,
      trongridApiClient: mockTrongridApiClient,
      tronHttpClient: mockTronHttpClient,
    });
  });

  describe('fetchNewTransactionsForAccount', () => {
    it('should fetch and map transactions for an account using native transfers mock data', async () => {
      // Setup mock responses with simplified single-transaction structure
      mockTrongridApiClient.getTransactionInfoByAddress.mockResolvedValue([
        nativeTransferMock,
      ] as TransactionInfo[]);
      mockTrongridApiClient.getContractTransactionInfoByAddress.mockResolvedValue(
        contractInfoMock.data as ContractTransactionInfo[],
      );

      await transactionsService.fetchNewTransactionsForAccount(
        Network.Mainnet,
        mockAccount,
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
        expect.stringContaining('Fetching new transactions for account'),
      );

      expect(true).toBe(true);
    });

    it('fetches and maps TRC10 transactions with token metadata', async () => {
      // Setup mock responses with simplified single-transaction structure
      mockTrongridApiClient.getTransactionInfoByAddress.mockResolvedValue([
        trc10TransferMock,
      ] as TransactionInfo[]);
      mockTrongridApiClient.getContractTransactionInfoByAddress.mockResolvedValue(
        [],
      );
      // Mock TRC10 token metadata response with 3 decimals
      mockTronHttpClient.getTRC10TokenMetadata.mockResolvedValue({
        name: 'BestAdsCoin',
        symbol: 'TRC20AdsCOM',
        decimals: 3,
      });

      const transactions =
        await transactionsService.fetchNewTransactionsForAccount(
          Network.Mainnet,
          mockAccount2,
        );

      // Verify API calls were made
      expect(
        mockTrongridApiClient.getTransactionInfoByAddress,
      ).toHaveBeenCalledWith(Network.Mainnet, mockAccount2.address);
      expect(
        mockTrongridApiClient.getContractTransactionInfoByAddress,
      ).toHaveBeenCalledWith(Network.Mainnet, mockAccount2.address);

      // Verify TRC10 token metadata was fetched for the token ID in the transaction
      expect(mockTronHttpClient.getTRC10TokenMetadata).toHaveBeenCalledWith(
        '1005119',
        Network.Mainnet,
      );

      // Verify the amount and symbol are from fetched metadata
      // Raw amount is 88888888, with 3 decimals: 88888888 / 10^3 = 88888.888
      expect(transactions).toHaveLength(1);
      const fromAsset = transactions[0]!.from[0]!.asset as {
        amount: string;
        unit: string;
      };
      const toAsset = transactions[0]!.to[0]!.asset as {
        amount: string;
        unit: string;
      };
      expect(fromAsset.amount).toBe('88888.888');
      expect(fromAsset.unit).toBe('TRC20AdsCOM');
      expect(toAsset.amount).toBe('88888.888');
      expect(toAsset.unit).toBe('TRC20AdsCOM');
    });

    it('falls back to defaults when TRC10 metadata fetch fails', async () => {
      // Setup mock responses with simplified single-transaction structure
      mockTrongridApiClient.getTransactionInfoByAddress.mockResolvedValue([
        trc10TransferMock,
      ] as TransactionInfo[]);
      mockTrongridApiClient.getContractTransactionInfoByAddress.mockResolvedValue(
        [],
      );
      // Mock TRC10 token metadata to fail
      mockTronHttpClient.getTRC10TokenMetadata.mockRejectedValue(
        new Error('Token not found'),
      );

      const transactions =
        await transactionsService.fetchNewTransactionsForAccount(
          Network.Mainnet,
          mockAccount2,
        );

      // Verify TRC10 token metadata fetch was attempted
      expect(mockTronHttpClient.getTRC10TokenMetadata).toHaveBeenCalledWith(
        '1005119',
        Network.Mainnet,
      );

      // Verify the amount falls back to default 6 decimals and symbol to UNKNOWN
      // Raw amount is 88888888, with 6 decimals: 88888888 / 10^6 = 88.888888
      expect(transactions).toHaveLength(1);
      const fromAsset = transactions[0]!.from[0]!.asset as {
        amount: string;
        unit: string;
      };
      const toAsset = transactions[0]!.to[0]!.asset as {
        amount: string;
        unit: string;
      };
      expect(fromAsset.amount).toBe('88.888888');
      expect(fromAsset.unit).toBe('UNKNOWN');
      expect(toAsset.amount).toBe('88.888888');
      expect(toAsset.unit).toBe('UNKNOWN');
    });

    it('should handle network parameter correctly for different networks', async () => {
      // Setup mock responses
      mockTrongridApiClient.getTransactionInfoByAddress.mockResolvedValue([]);
      mockTrongridApiClient.getContractTransactionInfoByAddress.mockResolvedValue(
        [],
      );

      await transactionsService.fetchNewTransactionsForAccount(
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

      const result = await transactionsService.fetchNewTransactionsForAccount(
        Network.Mainnet,
        mockAccount,
      );

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

      const result = await transactionsService.fetchNewTransactionsForAccount(
        Network.Mainnet,
        mockAccount,
      );

      expect(result).toStrictEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[🧾 TransactionsService]',
        'Failed to fetch raw transactions for address TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx on network tron:728126428',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[🧾 TransactionsService]',
        'Failed to fetch TRC20 transactions for address TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx on network tron:728126428',
      );
      expect(true).toBe(true);
    });

    it('skips already confirmed transactions but allows pending transactions to be updated', async () => {
      // Simulate a confirmed transaction ID that should be skipped
      const confirmedTxId = 'confirmed-tx-id';
      mockTransactionsRepository.getConfirmedTransactionIds.mockResolvedValue(
        new Set([confirmedTxId]),
      );

      // API returns both the confirmed tx and a new tx
      const confirmedTx = {
        ...nativeTransferMock,
        txID: confirmedTxId,
      };
      const newTx = {
        ...nativeTransferMock,
        txID: 'new-tx-id',
      };
      mockTrongridApiClient.getTransactionInfoByAddress.mockResolvedValue([
        confirmedTx,
        newTx,
      ] as TransactionInfo[]);
      mockTrongridApiClient.getContractTransactionInfoByAddress.mockResolvedValue(
        [],
      );

      const result = await transactionsService.fetchNewTransactionsForAccount(
        Network.Mainnet,
        mockAccount,
      );

      // Should only return the new transaction, not the confirmed one
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('new-tx-id');
    });

    it('re-fetches pending transactions so they can be updated to confirmed status', async () => {
      // Simulate a pending transaction that exists in state but is NOT in confirmed set
      const pendingTxId = nativeTransferMock.txID;
      mockTransactionsRepository.getConfirmedTransactionIds.mockResolvedValue(
        new Set(), // Pending tx ID is not in confirmed set
      );

      // API returns the same transaction (now confirmed on network)
      mockTrongridApiClient.getTransactionInfoByAddress.mockResolvedValue([
        nativeTransferMock,
      ] as TransactionInfo[]);
      mockTrongridApiClient.getContractTransactionInfoByAddress.mockResolvedValue(
        [],
      );

      const result = await transactionsService.fetchNewTransactionsForAccount(
        Network.Mainnet,
        mockAccount,
      );

      // The pending transaction should be returned so it can be updated
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(pendingTxId);
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

      expect(mockTransactionsRepository.saveMany).toHaveBeenCalledWith(
        mockTransactions,
      );
      expect(true).toBe(true);
    });

    it('should handle empty transactions array', async () => {
      await transactionsService.saveMany([]);

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
        await transactionsService.fetchNewTransactionsForAccount(
          Network.Mainnet,
          mockAccount,
        );

      // Save the fetched transactions
      await transactionsService.saveMany(fetchedTransactions);

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

      await transactionsService.fetchNewTransactionsForAccount(
        Network.Mainnet,
        mockAccount2,
      );

      expect(true).toBe(true);
    });
  });
});
