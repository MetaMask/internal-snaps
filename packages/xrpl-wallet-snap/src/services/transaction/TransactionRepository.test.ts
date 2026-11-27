import { TransactionStatus } from '@metamask/keyring-api';
import { InMemoryState } from '@metamask/snap-networks-utils';

import { KnownCaip2ChainId } from '../../api';
import { AppConfig } from '../../config';
import { DEFAULT_UNENCRYPTED_STATE } from '../state/stateTypes';
import { generateMockTransactions } from './__mocks__/transaction.fixtures';
import { TransactionRepository } from './TransactionRepository';

describe('TransactionRepository', () => {
  const scope = KnownCaip2ChainId.Mainnet;
  const accountId = 'account-1';

  const recentTimestampSeconds = (): number => Math.floor(Date.now() / 1000);

  const expiredTimestampSeconds = (): number =>
    Math.floor(
      (Date.now() - AppConfig.transaction.maxPendingTransactionAge - 1000) /
        1000,
    );

  const createRepository = (): TransactionRepository =>
    new TransactionRepository(
      new InMemoryState(structuredClone(DEFAULT_UNENCRYPTED_STATE)),
    );

  it('removes confirmed incoming transactions from snap state', async () => {
    const repository = createRepository();
    const pendingTransaction = generateMockTransactions(1, {
      id: 'tx-hash-1',
      account: accountId,
      scope,
      status: TransactionStatus.Unconfirmed,
    })[0];

    await repository.saveMany([pendingTransaction]);

    const confirmedTransaction = generateMockTransactions(1, {
      id: 'tx-hash-1',
      account: accountId,
      scope,
      status: TransactionStatus.Confirmed,
    })[0];

    await repository.saveMany([confirmedTransaction]);

    const stored = await repository.findXrplTransactionsByAccountIds([
      accountId,
    ]);
    expect(stored).toStrictEqual([]);
  });

  it('keeps incoming pending over existing when reconcileAttemptCount is higher', async () => {
    const repository = createRepository();
    const pendingTransaction = generateMockTransactions(1, {
      id: 'tx-hash-1',
      account: accountId,
      scope,
      status: TransactionStatus.Unconfirmed,
      timestamp: 100,
      reconcileAttemptCount: 1,
    })[0];

    await repository.saveMany([pendingTransaction]);

    await repository.saveMany([
      generateMockTransactions(1, {
        id: 'tx-hash-1',
        account: accountId,
        scope,
        status: TransactionStatus.Unconfirmed,
        timestamp: 100,
        reconcileAttemptCount: 2,
      })[0],
    ]);

    const stored = await repository.findXrplTransactionsByAccountIds([
      accountId,
    ]);
    expect(stored).toStrictEqual([
      expect.objectContaining({
        id: 'tx-hash-1',
        reconcileAttemptCount: 2,
      }),
    ]);
  });

  it('drops pending transactions when reconcile attempts and max age are both exceeded', async () => {
    const repository = createRepository();
    const pendingTransaction = generateMockTransactions(1, {
      id: 'tx-hash-1',
      account: accountId,
      scope,
      status: TransactionStatus.Unconfirmed,
      timestamp: expiredTimestampSeconds(),
      reconcileAttemptCount: 5,
    })[0];

    await repository.saveMany([pendingTransaction]);

    const stored = await repository.findXrplTransactionsByAccountIds([
      accountId,
    ]);
    expect(stored).toStrictEqual([]);
  });

  it('keeps pending transactions when reconcile attempts exceeded but max age is not', async () => {
    const repository = createRepository();
    const pendingTransaction = generateMockTransactions(1, {
      id: 'tx-hash-1',
      account: accountId,
      scope,
      status: TransactionStatus.Unconfirmed,
      timestamp: recentTimestampSeconds(),
      reconcileAttemptCount: 5,
    })[0];

    await repository.saveMany([pendingTransaction]);

    const stored = await repository.findXrplTransactionsByAccountIds([
      accountId,
    ]);
    expect(stored).toStrictEqual([
      expect.objectContaining({
        id: 'tx-hash-1',
        reconcileAttemptCount: 5,
      }),
    ]);
  });

  it('keeps pending transactions when max age exceeded but reconcile attempts are not', async () => {
    const repository = createRepository();
    const pendingTransaction = generateMockTransactions(1, {
      id: 'tx-hash-1',
      account: accountId,
      scope,
      status: TransactionStatus.Unconfirmed,
      timestamp: expiredTimestampSeconds(),
      reconcileAttemptCount: 1,
    })[0];

    await repository.saveMany([pendingTransaction]);

    const stored = await repository.findXrplTransactionsByAccountIds([
      accountId,
    ]);
    expect(stored).toStrictEqual([
      expect.objectContaining({
        id: 'tx-hash-1',
        reconcileAttemptCount: 1,
      }),
    ]);
  });
});
