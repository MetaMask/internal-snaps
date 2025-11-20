import type { KeyringAccount, Transaction } from '@metamask/keyring-api';
import { KeyringEvent } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import { groupBy } from 'lodash';

import { TransactionMapper } from './TransactionsMapper';
import type { TransactionsRepository } from './TransactionsRepository';
import type { TronHttpClient } from '../../clients/tron-http/TronHttpClient';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import type {
  ContractTransactionInfo,
  TransactionInfo,
} from '../../clients/trongrid/types';
import type { Network } from '../../constants';
import type { TronKeyringAccount } from '../../entities';
import type { ILogger } from '../../utils/logger';
import { createPrefixedLogger } from '../../utils/logger';

export class TransactionsService {
  readonly #logger: ILogger;

  readonly #transactionsRepository: TransactionsRepository;

  readonly #trongridApiClient: TrongridApiClient;

  readonly #tronHttpClient: TronHttpClient;

  constructor({
    logger,
    transactionsRepository,
    trongridApiClient,
    tronHttpClient,
  }: {
    logger: ILogger;
    transactionsRepository: TransactionsRepository;
    trongridApiClient: TrongridApiClient;
    tronHttpClient: TronHttpClient;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🧾 TransactionsService]');
    this.#transactionsRepository = transactionsRepository;
    this.#trongridApiClient = trongridApiClient;
    this.#tronHttpClient = tronHttpClient;
  }

  /**
   * Enriches potential swap transactions with full internal_transactions data.
   * TronGrid's /transactions endpoint often returns empty internal_transactions,
   * but we need this data for accurate TRX↔TRC20 swap detection.
   *
   * @param scope - The network scope.
   * @param rawTransactions - Array of transactions to potentially enrich.
   * @returns Array of enriched transactions.
   */
  async #enrichPotentialSwaps(
    scope: Network,
    rawTransactions: TransactionInfo[],
  ): Promise<TransactionInfo[]> {
    const enrichmentPromises = rawTransactions.map(async (tx) => {
      // Only enrich TriggerSmartContract transactions that might be swaps
      // and are missing internal_transactions from TronGrid's /transactions endpoint.
      // We also check for call_value > 0 as these are potential TRX swaps.
      const isTriggerSmartContract =
        tx.raw_data.contract?.[0]?.type === 'TriggerSmartContract';
      const hasEmptyInternalTransactions =
        !tx.internal_transactions || tx.internal_transactions.length === 0;
      const hasCallValue =
        (tx.raw_data.contract?.[0]?.parameter?.value as any)?.call_value > 0;

      if (
        isTriggerSmartContract &&
        hasEmptyInternalTransactions &&
        hasCallValue
      ) {
        this.#logger.debug(
          `Attempting to enrich transaction ${tx.txID} with full details for swap detection.`,
        );
        try {
          const fullTxInfo = await this.#tronHttpClient.getTransactionInfoById(
            scope,
            tx.txID,
          );

          if (fullTxInfo) {
            // Merge internal_transactions from fullTxInfo into the existing tx
            return {
              ...tx,
              // eslint-disable-next-line @typescript-eslint/naming-convention
              internal_transactions: fullTxInfo.internal_transactions ?? [],
            };
          }
        } catch (error) {
          this.#logger.warn(
            { txId: tx.txID, error },
            `Failed to enrich transaction ${tx.txID}`,
          );
        }
      }
      return tx; // Return original transaction if not enriched or on error
    });

    const enrichedTransactions = await Promise.allSettled(enrichmentPromises);

    return enrichedTransactions
      .map((result) => (result.status === 'fulfilled' ? result.value : null))
      .filter(Boolean) as TransactionInfo[];
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
    let tronRawTransactions: TransactionInfo[] = [];
    let tronTrc20Transactions: ContractTransactionInfo[] = [];

    const [tronRawTransactionsRequest, tronTrc20TransactionsRequest] =
      await Promise.allSettled([
        this.#trongridApiClient.getTransactionInfoByAddress(
          scope,
          account.address,
        ),
        this.#trongridApiClient.getContractTransactionInfoByAddress(
          scope,
          account.address,
        ),
      ]);

    if (tronRawTransactionsRequest.status === 'rejected') {
      this.#logger.error('Failed to fetch raw transactions');
      tronRawTransactions = [];
    } else {
      tronRawTransactions = tronRawTransactionsRequest.value;
    }

    if (tronTrc20TransactionsRequest.status === 'rejected') {
      this.#logger.error('Failed to fetch TRC20 transactions');
      tronTrc20Transactions = [];
    } else {
      tronTrc20Transactions = tronTrc20TransactionsRequest.value;
    }

    this.#logger.info(
      `Fetched ${tronRawTransactions.length} raw transactions and ${tronTrc20Transactions.length} TRC20 assistance data for account ${account.address} on network ${scope}.`,
    );

    /**
     * Enrich potential swap transactions with full internal_transactions data
     * This is necessary for accurate TRX↔TRC20 swap detection
     */
    const enrichedRawTransactions = await this.#enrichPotentialSwaps(
      scope,
      tronRawTransactions,
    );

    this.#logger.info(
      `Enriched ${enrichedRawTransactions.length} transactions for swap detection.`,
    );

    /**
     * Map transactions using raw data as primary source with TRC20 assistance
     * Raw transactions -> All transaction types (TRX, TRC10, TRC20, other smart contracts)
     * TRC20 assistance -> Enhanced parsing for TriggerSmartContract transactions
     */
    const transactions = TransactionMapper.mapTransactions({
      scope,
      account: account as TronKeyringAccount,
      rawTransactions: enrichedRawTransactions,
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
