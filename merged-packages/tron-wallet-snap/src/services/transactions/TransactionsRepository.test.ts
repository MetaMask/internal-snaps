import type { Transaction } from '@metamask/keyring-api';
import { TransactionStatus, TransactionType } from '@metamask/keyring-api';

import { TransactionsRepository } from './TransactionsRepository';
import { KnownCaip19Id, Network } from '../../constants';
import type { State, UnencryptedStateValue } from '../state/State';

describe('TransactionsRepository', () => {
  let transactionsRepository: TransactionsRepository;
  let mockState: jest.Mocked<State<UnencryptedStateValue>>;

  const mockAccountId = 'test-account-id';

  const createMockTransaction = (
    id: string,
    status: TransactionStatus,
  ): Transaction => ({
    id,
    type: TransactionType.Send,
    account: mockAccountId,
    chain: Network.Mainnet,
    status,
    timestamp: Math.floor(Date.now() / 1000),
    from: [
      {
        address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
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
        address: 'TFDP1vFeSYPT6FUznL7zUjhg5X7p2AA8vw',
        asset: {
          type: KnownCaip19Id.TrxMainnet,
          amount: '100',
          unit: 'TRX',
          fungible: true,
        },
      },
    ],
    events: [{ status, timestamp: Math.floor(Date.now() / 1000) }],
    fees: [],
  });

  beforeEach(() => {
    mockState = {
      getKey: jest.fn(),
      setKey: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<State<UnencryptedStateValue>>;

    transactionsRepository = new TransactionsRepository(mockState);
  });

  describe('getTransactionIdsByAccountId', () => {
    it('returns all transaction IDs for an account', async () => {
      const transactions = [
        createMockTransaction('tx1', TransactionStatus.Confirmed),
        createMockTransaction('tx2', TransactionStatus.Unconfirmed),
        createMockTransaction('tx3', TransactionStatus.Failed),
      ];
      mockState.getKey.mockResolvedValue(transactions);

      const result =
        await transactionsRepository.getTransactionIdsByAccountId(
          mockAccountId,
        );

      expect(result).toStrictEqual(new Set(['tx1', 'tx2', 'tx3']));
    });

    it('returns empty set when no transactions exist', async () => {
      mockState.getKey.mockResolvedValue(null);

      const result =
        await transactionsRepository.getTransactionIdsByAccountId(
          mockAccountId,
        );

      expect(result).toStrictEqual(new Set());
    });
  });

  describe('getConfirmedTransactionIds', () => {
    it('returns only confirmed and failed transaction IDs, excluding pending', async () => {
      const transactions = [
        createMockTransaction('confirmed-tx', TransactionStatus.Confirmed),
        createMockTransaction('pending-tx', TransactionStatus.Unconfirmed),
        createMockTransaction('failed-tx', TransactionStatus.Failed),
      ];
      mockState.getKey.mockResolvedValue(transactions);

      const result =
        await transactionsRepository.getConfirmedTransactionIds(mockAccountId);

      // Should include confirmed and failed, but NOT unconfirmed (pending)
      expect(result).toStrictEqual(new Set(['confirmed-tx', 'failed-tx']));
      expect(result.has('pending-tx')).toBe(false);
    });

    it('returns empty set when all transactions are pending', async () => {
      const transactions = [
        createMockTransaction('pending-tx-1', TransactionStatus.Unconfirmed),
        createMockTransaction('pending-tx-2', TransactionStatus.Unconfirmed),
      ];
      mockState.getKey.mockResolvedValue(transactions);

      const result =
        await transactionsRepository.getConfirmedTransactionIds(mockAccountId);

      expect(result).toStrictEqual(new Set());
    });

    it('returns empty set when no transactions exist', async () => {
      mockState.getKey.mockResolvedValue(null);

      const result =
        await transactionsRepository.getConfirmedTransactionIds(mockAccountId);

      expect(result).toStrictEqual(new Set());
    });

    it('returns all IDs when no transactions are pending', async () => {
      const transactions = [
        createMockTransaction('confirmed-tx-1', TransactionStatus.Confirmed),
        createMockTransaction('confirmed-tx-2', TransactionStatus.Confirmed),
        createMockTransaction('failed-tx', TransactionStatus.Failed),
      ];
      mockState.getKey.mockResolvedValue(transactions);

      const result =
        await transactionsRepository.getConfirmedTransactionIds(mockAccountId);

      expect(result).toStrictEqual(
        new Set(['confirmed-tx-1', 'confirmed-tx-2', 'failed-tx']),
      );
    });
  });
});
