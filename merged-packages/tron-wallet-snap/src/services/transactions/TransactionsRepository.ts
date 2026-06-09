import type { Transaction } from '@metamask/keyring-api';
import { TransactionStatus } from '@metamask/keyring-api';
import { chain } from 'lodash';

import type { State, UnencryptedStateValue } from '../state/State';

export class TransactionsRepository {
  readonly #state: State<UnencryptedStateValue>;

  readonly #stateKey = 'transactions';

  constructor(state: State<UnencryptedStateValue>) {
    this.#state = state;
  }

  async getAll(): Promise<Transaction[]> {
    const transactionsByAccount = await this.#state.getKey<
      UnencryptedStateValue['transactions']
    >(this.#stateKey);

    return Object.values(transactionsByAccount ?? {}).flat();
  }

  async findByAccountId(accountId: string): Promise<Transaction[]> {
    const transactions = await this.#state.getKey<Transaction[]>(
      `${this.#stateKey}.${accountId}`,
    );

    return transactions ?? [];
  }

  /**
   * Gets transaction IDs for an account as a Set for O(1) lookup.
   * Useful for incremental sync to check which transactions already exist.
   *
   * @param accountId - The account ID to get transaction IDs for.
   * @returns Set of transaction IDs.
   */
  async getTransactionIdsByAccountId(accountId: string): Promise<Set<string>> {
    const transactions = await this.#state.getKey<Transaction[]>(
      `${this.#stateKey}.${accountId}`,
    );

    return new Set((transactions ?? []).map((tx) => tx.id));
  }

  /**
   * Gets transaction IDs for confirmed (non-pending) transactions only.
   * This allows pending transactions to be re-fetched and updated when
   * their confirmed version becomes available from the network.
   *
   * @param accountId - The account ID to get confirmed transaction IDs for.
   * @returns Set of transaction IDs for confirmed transactions only.
   */
  async getConfirmedTransactionIds(accountId: string): Promise<Set<string>> {
    const transactions = await this.#state.getKey<Transaction[]>(
      `${this.#stateKey}.${accountId}`,
    );

    return new Set(
      (transactions ?? [])
        .filter((tx) => tx.status !== TransactionStatus.Unconfirmed)
        .map((tx) => tx.id),
    );
  }

  async save(transaction: Transaction): Promise<void> {
    await this.saveMany([transaction]);
  }

  async saveMany(transactions: Transaction[]): Promise<void> {
    // Optimize the sate operations by reading and writing to the state only once
    await this.#state.update((state) => {
      const allTransactionsByAccount = state[this.#stateKey];

      transactions.forEach((transaction) => {
        const signature = transaction.id;
        const accountId = transaction.account;
        const existingTransactionsForAccount =
          allTransactionsByAccount[accountId] ?? [];

        // Avoid duplicates. If a transaction with the same signature already exists, override it.
        const sameSignatureTransactionIndex =
          existingTransactionsForAccount.findIndex((tx) => tx.id === signature);

        if (sameSignatureTransactionIndex !== -1) {
          existingTransactionsForAccount[sameSignatureTransactionIndex] =
            transaction;
        }

        const updatedTransactions = chain([
          ...existingTransactionsForAccount,
          transaction,
        ])
          .uniqBy('id')
          .sortBy((item) => -(item.timestamp ?? 0)) // Sort by timestamp in descending order
          .value();

        state[this.#stateKey][accountId] = updatedTransactions;
      });

      return state;
    });
  }
}
