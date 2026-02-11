import type { KeyringAccount, Transaction } from '@metamask/keyring-api';
import { KeyringEvent } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import { groupBy } from 'lodash';

import { TransactionMapper } from './TransactionsMapper';
import type { TransactionsRepository } from './TransactionsRepository';
import type { TronHttpClient } from '../../clients/tron-http/TronHttpClient';
import type { TRC10TokenMetadata } from '../../clients/tron-http/types';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import type {
  ContractTransactionInfo,
  TransactionInfo,
  TransferAssetContractInfo,
} from '../../clients/trongrid/types';
import type { Network } from '../../constants';
import type { TronKeyringAccount } from '../../entities';
import { hexToString } from '../../utils/hex';
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  /**
   * Extracts unique TRC10 token IDs from raw transactions and fetches their metadata.
   * This is used to get the correct decimal precision for TRC10 token amount conversions.
   *
   * @param scope - The network scope.
   * @param rawTransactions - Array of raw transactions to scan for TRC10 transfers.
   * @returns Map of token ID to TRC10 token metadata.
   */
  async #fetchTrc10TokenMetadata(
    scope: Network,
    rawTransactions: TransactionInfo[],
  ): Promise<Map<string, TRC10TokenMetadata>> {
    const trc10TokenMetadata = new Map<string, TRC10TokenMetadata>();

    // Extract unique TRC10 token IDs from TransferAssetContract transactions
    const trc10TokenIds = new Set<string>();

    for (const tx of rawTransactions) {
      const contract = tx.raw_data.contract?.[0];
      if (contract?.type === 'TransferAssetContract') {
        const assetContract = contract as TransferAssetContractInfo;
        const tokenId = hexToString(assetContract.parameter.value.asset_name);
        trc10TokenIds.add(tokenId);
      }
    }

    if (trc10TokenIds.size === 0) {
      return trc10TokenMetadata;
    }

    this.#logger.debug(
      `Fetching metadata for ${trc10TokenIds.size} TRC10 tokens...`,
    );

    // Fetch metadata for each unique token ID
    const metadataPromises = Array.from(trc10TokenIds).map(async (tokenId) => {
      try {
        const metadata = await this.#tronHttpClient.getTRC10TokenMetadata(
          tokenId,
          scope,
        );
        return { tokenId, metadata };
      } catch (error) {
        this.#logger.warn(
          { tokenId, error },
          `Failed to fetch TRC10 token metadata for ${tokenId}, will use default decimals`,
        );
        return null;
      }
    });

    const results = await Promise.allSettled(metadataPromises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        trc10TokenMetadata.set(result.value.tokenId, result.value.metadata);
      }
    }

    this.#logger.debug(
      `Successfully fetched metadata for ${trc10TokenMetadata.size}/${trc10TokenIds.size} TRC10 tokens.`,
    );

    return trc10TokenMetadata;
  }

  /**
   * Fetches and processes only NEW transactions for an account.
   *
   * This function implements incremental sync - it only processes transactions
   * that are not already in state, avoiding redundant API calls for:
   * - getTransactionInfoById (swap enrichment)
   * - getTRC10TokenMetadata (token decimals)
   *
   * The caller is responsible for saving the returned transactions to state
   * via `saveMany()`, which will merge them with existing transactions.
   *
   * @param scope - The network scope.
   * @param account - The account to fetch transactions for.
   * @returns Only NEW transactions (not already in state). Empty array if none.
   */
  async fetchNewTransactionsForAccount(
    scope: Network,
    account: KeyringAccount,
  ): Promise<Transaction[]> {
    this.#logger.info(
      `Fetching new transactions for account ${account.address} on network ${scope}...`,
    );

    /**
     * Step 1: Load confirmed transaction IDs from state
     *
     * We only skip transactions that are already confirmed. Pending (Unconfirmed)
     * transactions are allowed to be re-fetched so their status can be updated
     * when they become confirmed on the network.
     */
    const confirmedTxIds =
      await this.#transactionsRepository.getConfirmedTransactionIds(account.id);

    this.#logger.debug(
      `Found ${confirmedTxIds.size} confirmed transactions in state for account ${account.id}.`,
    );

    /**
     * Step 2: Fetch raw transaction list from TronGrid
     *
     * Fetch the foundational transaction data from TronGrid in parallel:
     * - Raw transactions: Primary source for all transaction types
     * - TRC20 transactions: Assistance data for smart contract parsing
     */
    const { rawTransactions, trc20Transactions } =
      await this.#fetchRawTransactionData(scope, account.address);

    this.#logger.info(
      `Fetched ${rawTransactions.length} raw transactions and ${trc20Transactions.length} TRC20 assistance data for account ${account.address} on network ${scope}.`,
    );

    /**
     * Step 3: Filter to transactions that need processing
     *
     * Skip transactions that are already confirmed in state.
     * Pending transactions are included so they can be updated when confirmed.
     * This maintains the optimization while allowing status updates.
     */
    const transactionsToProcess = rawTransactions.filter(
      (tx) => !confirmedTxIds.has(tx.txID),
    );

    this.#logger.info(
      `Found ${transactionsToProcess.length} transactions to process (${rawTransactions.length - transactionsToProcess.length} already confirmed in state).`,
    );

    /**
     * Step 4: If no transactions to process, return empty array
     *
     * This is the fast path - skip all enrichment and mapping.
     */
    if (transactionsToProcess.length === 0) {
      this.#logger.info(`No transactions to process.`);
      return [];
    }

    /**
     * Step 5: Process transactions (enrichment + mapping)
     *
     * Enrich potential swaps with internal_transactions data
     * and fetch TRC10 token metadata for transactions to process.
     */
    const { enrichedRawTransactions, trc10TokenMetadata } =
      await this.#fetchEnrichmentData(scope, transactionsToProcess);

    this.#logger.info(
      `Enriched ${enrichedRawTransactions.length} transactions, fetched metadata for ${trc10TokenMetadata.size} TRC10 tokens.`,
    );

    /**
     * Step 6: Map transactions to keyring format
     *
     * Filter TRC20 assistance data to only include transactions matching processed txs.
     */
    const processedTxIds = new Set(transactionsToProcess.map((tx) => tx.txID));
    const relevantTrc20Transactions = trc20Transactions.filter((tx) =>
      processedTxIds.has(tx.transaction_id),
    );

    const mappedTransactions = TransactionMapper.mapTransactions({
      scope,
      account: account as TronKeyringAccount,
      rawTransactions: enrichedRawTransactions,
      trc20Transactions: relevantTrc20Transactions,
      trc10TokenMetadata,
    });

    this.#logger.info(
      `Returning ${mappedTransactions.length} transactions for account ${account.address} on network ${scope}.`,
    );

    return mappedTransactions;
  }

  /**
   * Fetches the foundational transaction data from TronGrid.
   * Both requests run in parallel for optimal performance.
   *
   * @param scope - The network scope.
   * @param address - The account address to fetch transactions for.
   * @returns Raw transactions and TRC20 transactions.
   */
  async #fetchRawTransactionData(
    scope: Network,
    address: string,
  ): Promise<{
    rawTransactions: TransactionInfo[];
    trc20Transactions: ContractTransactionInfo[];
  }> {
    const [rawTransactionsResult, trc20TransactionsResult] =
      await Promise.allSettled([
        this.#trongridApiClient.getTransactionInfoByAddress(scope, address),
        this.#trongridApiClient.getContractTransactionInfoByAddress(
          scope,
          address,
        ),
      ]);

    let rawTransactions: TransactionInfo[] = [];
    let trc20Transactions: ContractTransactionInfo[] = [];

    if (rawTransactionsResult.status === 'rejected') {
      this.#logger.error(
        `Failed to fetch raw transactions for address ${address} on network ${scope}`,
      );
    } else {
      rawTransactions = rawTransactionsResult.value;
    }

    if (trc20TransactionsResult.status === 'rejected') {
      this.#logger.error(
        `Failed to fetch TRC20 transactions for address ${address} on network ${scope}`,
      );
    } else {
      trc20Transactions = trc20TransactionsResult.value;
    }

    return { rawTransactions, trc20Transactions };
  }

  /**
   * Fetches enrichment data based on the raw transactions.
   * Both enrichment operations run in parallel since they scan for different contract types:
   * - Swap enrichment scans for TriggerSmartContract
   * - TRC10 metadata scans for TransferAssetContract
   *
   * @param scope - The network scope.
   * @param rawTransactions - The raw transactions to enrich.
   * @returns Enriched transactions and TRC10 token metadata.
   */
  async #fetchEnrichmentData(
    scope: Network,
    rawTransactions: TransactionInfo[],
  ): Promise<{
    enrichedRawTransactions: TransactionInfo[];
    trc10TokenMetadata: Map<string, TRC10TokenMetadata>;
  }> {
    const [enrichedRawTransactions, trc10TokenMetadata] = await Promise.all([
      this.#enrichPotentialSwaps(scope, rawTransactions),
      this.#fetchTrc10TokenMetadata(scope, rawTransactions),
    ]);

    return { enrichedRawTransactions, trc10TokenMetadata };
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
