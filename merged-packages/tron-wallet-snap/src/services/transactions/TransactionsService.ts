import type { KeyringAccount, Transaction } from '@metamask/keyring-api';
import { KeyringEvent } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import { groupBy } from 'lodash';

import { TransactionMapper } from './TransactionsMapper';
import type { TransactionsRepository } from './TransactionsRepository';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import type { Network } from '../../constants';
import type { TronKeyringAccount } from '../../entities';
import type { ILogger } from '../../utils/logger';
import { createPrefixedLogger } from '../../utils/logger';

export class TransactionsService {
  readonly #logger: ILogger;

  readonly #transactionsRepository: TransactionsRepository;

  readonly #trongridApiClient: TrongridApiClient;

  constructor({
    logger,
    transactionsRepository,
    trongridApiClient,
  }: {
    logger: ILogger;
    transactionsRepository: TransactionsRepository;
    trongridApiClient: TrongridApiClient;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🧾 TransactionsService]');
    this.#transactionsRepository = transactionsRepository;
    this.#trongridApiClient = trongridApiClient;
  }

  async fetchTransactionsForAccount(
    scope: Network,
    account: KeyringAccount,
  ): Promise<Transaction[]> {
    this.#logger.info(
      `Fetching transactions for account ${account.address} on network ${scope}...`,
    );
    /**
     * Raw transactions are the primary source containing complete transaction history
     * TRC20 transactions provide assistance data for enhanced smart contract parsing
     */
    const [tronRawTransactions, tronTrc20Transactions] = await Promise.all([
      this.#trongridApiClient.getTransactionInfoByAddress(
        scope,
        account.address,
      ),
      this.#trongridApiClient.getContractTransactionInfoByAddress(
        scope,
        account.address,
      ),
    ]);

    this.#logger.info(
      `Fetched ${tronRawTransactions.length} raw transactions and ${tronTrc20Transactions.length} TRC20 assistance data for account ${account.address} on network ${scope}.`,
    );

    /**
     * Map transactions using raw data as primary source with TRC20 assistance
     * Raw transactions -> All transaction types (TRX, TRC10, TRC20, other smart contracts)
     * TRC20 assistance -> Enhanced parsing for TriggerSmartContract transactions
     */
    const transactions = TransactionMapper.mapTransactions({
      scope,
      account: account as TronKeyringAccount,
      rawTransactions: tronRawTransactions,
      trc20Transactions: tronTrc20Transactions,
    });

    this.#logger.info(
      `Mapped ${transactions.length} transactions for account ${account.address} on network ${scope}.`,
    );

    return transactions;
  }

  async findByAccounts(accounts: TronKeyringAccount[]): Promise<Transaction[]> {
    const transactions = await Promise.all(
      accounts.map(async (account) =>
        this.#transactionsRepository.findByAccountId(account.id),
      ),
    );

    return transactions.flat();
  }

  async save(transaction: Transaction): Promise<void> {
    await this.saveMany([transaction]);
  }

  async saveMany(transactions: Transaction[]): Promise<void> {
    await this.#transactionsRepository.saveMany(transactions);

    const transactionsByAccountId = groupBy(transactions, 'account');

    await emitSnapKeyringEvent(snap, KeyringEvent.AccountTransactionsUpdated, {
      transactions: transactionsByAccountId,
    });
  }
}
