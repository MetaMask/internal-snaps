import { TransactionStatus } from '@metamask/keyring-api';
import { InMemoryState } from '@metamask/snap-networks-utils';

import { KnownCaip2ChainId } from '../../api';
import { AppConfig } from '../../config';
import { generateMockTransactions } from './__mocks__/transaction.fixtures';
import type { TransactionStateValue, XrplKeyringTransaction } from './api';
import { TransactionRepository } from './TransactionRepository';

const scope = KnownCaip2ChainId.Mainnet;
const accountId = 'account-1';

/**
 * Creates an in-memory state for repository tests.
 *
 * @param transactions - Initial transactions keyed by account id.
 * @param lastScanTokens - Optional scan cursors keyed by account id.
 * @returns An in-memory state seeded with the provided transactions.
 */
function createState(
  transactions: Record<string, XrplKeyringTransaction[]> = {},
  lastScanTokens: TransactionStateValue['lastScanTokens'] = {},
): InMemoryState<TransactionStateValue> {
  return new InMemoryState<TransactionStateValue>({
    transactions,
    lastScanTokens,
  });
}

function recentTimestampSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function expiredTimestampSeconds(): number {
  return Math.floor(
    (Date.now() - AppConfig.transaction.maxPendingTransactionAge - 1000) / 1000,
  );
}

describe('TransactionRepository', () => {
  describe('saveMany', () => {
    it('removes confirmed incoming transactions from snap state', async () => {
      const [pendingTransaction] = generateMockTransactions(1, {
        id: 'tx-hash-1',
        account: accountId,
        scope,
        status: TransactionStatus.Unconfirmed,
      }) as [XrplKeyringTransaction];
      const repository = new TransactionRepository(
        createState({ [accountId]: [pendingTransaction] }),
      );
      const [confirmedTransaction] = generateMockTransactions(1, {
        id: 'tx-hash-1',
        account: accountId,
        scope,
        status: TransactionStatus.Confirmed,
      }) as [XrplKeyringTransaction];

      await repository.saveMany([confirmedTransaction]);

      expect(
        await repository.findXrplTransactionsByAccountIds([accountId]),
      ).toStrictEqual([]);
    });

    it('keeps incoming pending over existing when reconcileAttemptCount is higher', async () => {
      const [pendingTransaction] = generateMockTransactions(1, {
        id: 'tx-hash-1',
        account: accountId,
        scope,
        status: TransactionStatus.Unconfirmed,
        timestamp: 100,
        reconcileAttemptCount: 1,
      }) as [XrplKeyringTransaction];
      const repository = new TransactionRepository(
        createState({ [accountId]: [pendingTransaction] }),
      );
      const [updatedPending] = generateMockTransactions(1, {
        id: 'tx-hash-1',
        account: accountId,
        scope,
        status: TransactionStatus.Unconfirmed,
        timestamp: 100,
        reconcileAttemptCount: 2,
      }) as [XrplKeyringTransaction];

      await repository.saveMany([updatedPending]);

      expect(
        await repository.findXrplTransactionsByAccountIds([accountId]),
      ).toStrictEqual([
        expect.objectContaining({
          id: 'tx-hash-1',
          reconcileAttemptCount: 2,
        }),
      ]);
    });

    it('drops pending transactions when reconcile attempts and max age are both exceeded', async () => {
      const repository = new TransactionRepository(createState());
      const [pendingTransaction] = generateMockTransactions(1, {
        id: 'tx-hash-1',
        account: accountId,
        scope,
        status: TransactionStatus.Unconfirmed,
        timestamp: expiredTimestampSeconds(),
        reconcileAttemptCount: 5,
      }) as [XrplKeyringTransaction];

      await repository.saveMany([pendingTransaction]);

      expect(
        await repository.findXrplTransactionsByAccountIds([accountId]),
      ).toStrictEqual([]);
    });

    it('keeps pending transactions when reconcile attempts exceeded but max age is not', async () => {
      const repository = new TransactionRepository(createState());
      const [pendingTransaction] = generateMockTransactions(1, {
        id: 'tx-hash-1',
        account: accountId,
        scope,
        status: TransactionStatus.Unconfirmed,
        timestamp: recentTimestampSeconds(),
        reconcileAttemptCount: 5,
      }) as [XrplKeyringTransaction];

      await repository.saveMany([pendingTransaction]);

      expect(
        await repository.findXrplTransactionsByAccountIds([accountId]),
      ).toStrictEqual([
        expect.objectContaining({
          id: 'tx-hash-1',
          reconcileAttemptCount: 5,
        }),
      ]);
    });

    it('keeps pending transactions when max age exceeded but reconcile attempts are not', async () => {
      const repository = new TransactionRepository(createState());
      const [pendingTransaction] = generateMockTransactions(1, {
        id: 'tx-hash-1',
        account: accountId,
        scope,
        status: TransactionStatus.Unconfirmed,
        timestamp: expiredTimestampSeconds(),
        reconcileAttemptCount: 1,
      }) as [XrplKeyringTransaction];

      await repository.saveMany([pendingTransaction]);

      expect(
        await repository.findXrplTransactionsByAccountIds([accountId]),
      ).toStrictEqual([
        expect.objectContaining({
          id: 'tx-hash-1',
          reconcileAttemptCount: 1,
        }),
      ]);
    });
  });
});
