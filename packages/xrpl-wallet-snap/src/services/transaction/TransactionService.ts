import type { Transaction as KeyringTransaction } from '@metamask/keyring-api';
import type { Logger } from '@metamask/snap-networks-utils';
import { assert } from '@metamask/superstruct';
import type { Transaction as XrplTransaction } from 'xrpl';

import type {
  KnownCaip19AssetId,
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip19IouAssetId,
  KnownCaip19MptAssetId,
  KnownCaip2ChainId,
} from '../../api';
import { XrplTransactionStringStruct } from '../../api';
import type { AnyErrorConstructor } from '../../utils';
import {
  isIouAssetId,
  isSlip44Id,
  parseIouAsset,
  trackError,
} from '../../utils';
import type { NetworkService } from '../network';
import type { OnChainAccountService } from '../on-chain-account';
import type { OnChainAccount } from '../on-chain-account/OnChainAccount';
import { ActivatedAccountPair } from '../sync/api';
import {
  TransactionBuilderException,
  TransactionDeserializationException,
} from './exceptions';
import type { KeyringTransactionRequest } from './KeyringTransactionBuilder';
import { KeyringTransactionBuilder } from './KeyringTransactionBuilder';
import { Transaction } from './Transaction';
import {
  TransactionAutofiller,
  TransactionAutofillerOptions,
} from './TransactionAutofiller';
import { TransactionBuilder } from './TransactionBuilder';
import { TransactionFeeEstimator } from './TransactionFeeEstimator';
import type { TransactionRepository } from './TransactionRepository';
import { TransactionSimulator } from './TransactionSimulator';
import type { TransactionSimulatorOptions } from './TransactionSimulator';
import {
  assertAccountScopeMatch,
  emitAccountTransactionsUpdated,
  getTransactions,
  statusFromTxResponse,
} from './utils';

type AccountLoad = {
  address: string;
  assetIds: KnownCaip19AssetId[];
};

export class TransactionService {
  readonly #logger: Logger;

  readonly #transactionRepository: TransactionRepository;

  readonly #networkService: NetworkService;

  readonly #transactionBuilder: TransactionBuilder;

  readonly #keyringTransactionBuilder: KeyringTransactionBuilder;

  readonly #transactionAutofiller: TransactionAutofiller;

  readonly #transactionSimulator: TransactionSimulator;

  readonly #onChainAccountService: OnChainAccountService;

  constructor({
    logger,
    transactionRepository,
    networkService,
    onChainAccountService,
  }: {
    logger: Logger;
    transactionRepository: TransactionRepository;
    networkService: NetworkService;
    onChainAccountService: OnChainAccountService;
  }) {
    this.#logger = logger.withPrefix('[🧾 TransactionService]');
    this.#transactionRepository = transactionRepository;
    this.#networkService = networkService;
    this.#transactionBuilder = new TransactionBuilder();
    this.#onChainAccountService = onChainAccountService;
    this.#keyringTransactionBuilder = new KeyringTransactionBuilder();
    const transactionFeeEstimator = new TransactionFeeEstimator({
      networkService,
    });
    this.#transactionAutofiller = new TransactionAutofiller({
      networkService,
      transactionFeeEstimator,
    });
    this.#transactionSimulator = new TransactionSimulator({
      networkService,
      logger,
    });
  }

  /**
   * Gets the keyring transaction builder.
   *
   * @returns The keyring transaction builder.
   */
  get keyringTransactionBuilder(): KeyringTransactionBuilder {
    return this.#keyringTransactionBuilder;
  }

  /**
   * Creates a validated change trust transaction.
   *
   * @param params - The parameters for the transaction.
   * @param params.onChainAccount - The on-chain account.
   * @param params.scope - The CAIP-2 chain ID.
   * @param params.assetId - The CAIP-19 asset ID (native, IOU, or MPT).
   * @param params.limit - The limit for the trustline, 0 for delete trustline.
   * @returns A promise that resolves to the validated transaction.
   */
  async createValidatedChangeTrustTransaction(params: {
    onChainAccount: OnChainAccount;
    scope: KnownCaip2ChainId;
    assetId: KnownCaip19IouAssetId;
    limit?: string;
  }): Promise<Transaction> {
    const { onChainAccount, scope, assetId, limit } = params;
    assertAccountScopeMatch(onChainAccount, scope);

    const transaction = this.#transactionBuilder.changeTrust({
      onChainAccount,
      assetId,
      limit,
    });
    const { transaction: validated } = await this.#autoFillAndValidate(
      transaction,
      scope,
      onChainAccount,
    );
    return validated;
  }

  /**
   * Creates a validated MPTokenAuthorize (holder authorize / unauthorize).
   *
   * @param params - The parameters for the transaction.
   * @param params.onChainAccount - The on-chain account.
   * @param params.scope - The CAIP-2 chain ID.
   * @param params.assetId - The CAIP-19 MPT asset ID.
   * @param params.authorize - `true` to authorize; `false` to unauthorize.
   * @returns A promise that resolves to the validated transaction.
   */
  async createValidatedMptAuthorizeTransaction(params: {
    onChainAccount: OnChainAccount;
    scope: KnownCaip2ChainId;
    assetId: KnownCaip19MptAssetId;
    authorize: boolean;
  }): Promise<Transaction> {
    const { onChainAccount, scope, assetId, authorize } = params;
    assertAccountScopeMatch(onChainAccount, scope);

    const transaction = this.#transactionBuilder.mptAuthorize({
      onChainAccount,
      assetId,
      authorize,
    });
    const { transaction: validated } = await this.#autoFillAndValidate(
      transaction,
      scope,
      onChainAccount,
    );
    return validated;
  }

  /**
   * Creates a validated send transaction (native or IOU).
   *
   * When `skipExceptions` includes {@link RequiresDestinationTagException} or
   * {@link TrustlineExceedLimitException}, those checks are suppressed during
   * simulation (e.g. amount-input self-sends, confirm-send dest-tag drafts).
   *
   * IOU payments cannot fund a new account: after preload omits an unactivated
   * destination, simulation throws {@link InvalidAssetForCreateAccountException}.
   *
   * @param params - The parameters for the transaction.
   * @param params.onChainAccount - The on-chain account.
   * @param params.amount - Ledger amount (drops for native, display units for IOU).
   * @param params.scope - The CAIP-2 chain ID.
   * @param params.assetId - The CAIP-19 asset ID.
   * @param params.destination - The destination address.
   * @param params.destinationTag - Optional XRPL `DestinationTag` (UInt32).
   * @param params.skipExceptions - Validation exception constructors to suppress.
   * @param params.useCache - When true, reuse cached network reads.
   * @param params.autoFill - Autofill field selection / force-refresh overrides.
   * @returns The autofilled transaction and accounts loaded for validation.
   */
  async createValidatedSendTransaction(params: {
    onChainAccount: OnChainAccount;
    scope: KnownCaip2ChainId;
    amount: BigNumber;
    assetId: KnownCaip19AssetIdOrSlip44Id;
    destination: string;
    destinationTag?: number;
    skipExceptions?: readonly AnyErrorConstructor[];
    useCache?: boolean;
    autoFill?: TransactionAutofillerOptions;
  }): Promise<{
    transaction: Transaction;
    invokedAccounts: OnChainAccount[];
  }> {
    const {
      onChainAccount,
      scope,
      skipExceptions,
      useCache = false,
      autoFill,
    } = params;
    assertAccountScopeMatch(onChainAccount, scope);

    // Unactivated IOU destinations are rejected in simulation after
    // `#preloadInvokedAccounts` omits them from the snapshot
    // (`InvalidAssetForCreateAccountException`).
    const draft = this.#buildSendPaymentDraft(params);
    const { transaction, invokedAccounts } = await this.#autoFillAndValidate(
      draft,
      scope,
      onChainAccount,
      {
        skipExceptions,
        useCache,
        autoFill,
      },
    );
    return { transaction, invokedAccounts };
  }

  /**
   * Builds an unsigned native or IOU Payment draft.
   *
   * @param params - Send parameters.
   * @returns Unsigned XRPL Payment JSON.
   */
  #buildSendPaymentDraft(params: {
    onChainAccount: OnChainAccount;
    amount: BigNumber;
    assetId: KnownCaip19AssetIdOrSlip44Id;
    destination: string;
    destinationTag?: number;
  }): XrplTransaction {
    const { onChainAccount, amount, assetId, destination, destinationTag } =
      params;

    if (isSlip44Id(assetId)) {
      return this.#transactionBuilder.nativePayment({
        assetId,
        onChainAccount,
        amount,
        destination,
        destinationTag,
      });
    }
    if (isIouAssetId(assetId)) {
      return this.#transactionBuilder.iouPayment({
        onChainAccount,
        assetId,
        amount,
        destination,
        destinationTag,
      });
    }
    throw new TransactionBuilderException(
      `Unsupported asset for send: ${assetId}`,
    );
  }

  /**
   * Creates a validated swap transaction from an encoded transaction blob.
   *
   * @param _params - The parameters for the transaction.
   * @param _params.onChainAccount - The on-chain account.
   * @param _params.scope - The CAIP-2 chain ID.
   * @param _params.transaction - Encoded transaction. Swaps are not supported yet.
   * @returns A promise that resolves to the validated transaction.
   */
  async createValidatedSwapTransaction(_params: {
    onChainAccount: OnChainAccount;
    scope: KnownCaip2ChainId;
    transaction: string;
  }): Promise<Transaction> {
    throw new TransactionBuilderException(
      'Swap transactions are not supported for XRPL yet',
    );
  }

  /**
   * Runs {@link TransactionAutofiller.autofill} on a draft and wraps the result.
   *
   * @param draft - Unsigned XRPL JSON.
   * @param scope - CAIP-2 chain ID.
   * @param options - Autofill options (`useCache`, `fillItems`, `forceRefresh`).
   * @returns Wrapped autofilled transaction.
   */
  async #autoFill(
    draft: XrplTransaction,
    scope: KnownCaip2ChainId,
    options: TransactionAutofillerOptions = {},
  ): Promise<Transaction> {
    const filled = await this.#transactionAutofiller.autofill(
      draft,
      scope,
      options,
    );
    return new Transaction(filled, scope);
  }

  /**
   * Create and save a pending keyring transaction.
   *
   * @param request - The request {@link KeyringTransactionRequest} to create the pending transaction for.
   * @returns A promise that resolves to the pending transaction.
   */
  async savePendingKeyringTransaction(
    request: KeyringTransactionRequest,
  ): Promise<KeyringTransaction> {
    const transaction =
      this.#keyringTransactionBuilder.createTransaction(request);

    this.#logger.debug('Creating pending transaction', {
      transaction,
    });

    await this.#saveAndEmit(transaction);

    return transaction;
  }

  /**
   * Saves a pending keyring transaction without failing the caller when persistence errors.
   *
   * @param request - Pending transaction payload to persist.
   * @returns The saved keyring transaction, or `null` when persistence fails.
   */
  async savePendingKeyringTransactionSafe(
    request: KeyringTransactionRequest,
  ): Promise<KeyringTransaction | null> {
    try {
      return await this.savePendingKeyringTransaction(request);
    } catch (error: unknown) {
      await trackError(error);

      this.#logger.error('Failed to save pending transaction', { error });
      return null;
    }
  }

  /**
   * Loads every other account the transaction touches, then validates it.
   *
   * The source snapshot is already loaded. Other accounts are loaded here,
   * with only the trust lines the transaction uses.
   *
   * @param transaction - Autofilled transaction to check. A `Batch` is checked inner by inner.
   * @param onChainAccount - Source account. Spendable XRP and trust lines are read from this snapshot.
   * @param options - Optional validation skips (destination tag / trust-line limit only).
   * @returns Preloaded accounts other than the source (omits unactivated destinations).
   * @throws {TransactionValidationException} When the transaction cannot be submitted.
   */
  async validateTransaction(
    transaction: Transaction,
    onChainAccount: OnChainAccount,
    options?: TransactionSimulatorOptions,
  ): Promise<OnChainAccount[]> {
    const accounts = await this.#preloadInvokedAccounts(
      transaction,
      onChainAccount,
      options?.useCache === true,
    );
    await this.#transactionSimulator.simulate(
      transaction,
      onChainAccount,
      accounts,
      options,
    );
    return accounts;
  }

  /**
   * Fills a draft, then validates it against preloaded accounts.
   *
   * @param draft - Unsigned XRPL JSON.
   * @param scope - CAIP-2 chain ID.
   * @param onChainAccount - Source account snapshot.
   * @param options - Simulator skips plus optional autofill overrides.
   * @returns Wrapped autofilled transaction and accounts loaded for validation.
   */
  async #autoFillAndValidate(
    draft: XrplTransaction,
    scope: KnownCaip2ChainId,
    onChainAccount: OnChainAccount,
    options?: TransactionSimulatorOptions & {
      autoFill?: TransactionAutofillerOptions;
    },
  ): Promise<{
    transaction: Transaction;
    invokedAccounts: OnChainAccount[];
  }> {
    const transaction = await this.#autoFill(draft, scope, {
      ...options?.autoFill,
      useCache: options?.useCache === true,
    });
    const invokedAccounts = await this.validateTransaction(
      transaction,
      onChainAccount,
      options,
    );
    return { transaction, invokedAccounts };
  }

  /**
   * Loads accounts other than the source.
   *
   * Each account is loaded with only the trust lines the transaction uses.
   * An account missing from the ledger is left out. A native payment can create it.
   *
   * @param transaction - Transaction about to be validated.
   * @param source - Source account, already loaded.
   * @param useCache - When true, reuse cached `account_info` reads.
   * @returns Accounts that exist on the ledger.
   */
  async #preloadInvokedAccounts(
    transaction: Transaction,
    source: OnChainAccount,
    useCache: boolean = false,
  ): Promise<OnChainAccount[]> {
    const addressesAndAssetIdsPairs =
      this.#extractAddressesAndAssetIdsPairsFromTransaction(
        transaction,
        source,
      );

    const accounts = await Promise.all(
      addressesAndAssetIdsPairs.map(async (load) =>
        this.#onChainAccountService.fetchActivatedAccount({
          address: load.address,
          assetIds: load.assetIds,
          scope: source.scope,
          useCache,
        }),
      ),
    );

    const activatedAccounts = accounts.filter(
      (account): account is OnChainAccount => account !== null,
    );

    this.#logger.debug('Preloaded invoked accounts', {
      count: activatedAccounts.length,
    });

    return activatedAccounts;
  }

  /**
   * Addresses to load besides the source, with the trust lines each one needs.
   *
   * Each IOU issuer is included even when they are not a party to the payment,
   * so a global freeze on that account is visible.
   *
   * @param rootTransaction - Outer transaction.
   * @param source - Source account, already loaded.
   * @returns One entry per address.
   */
  #extractAddressesAndAssetIdsPairsFromTransaction(
    rootTransaction: Transaction,
    source: OnChainAccount,
  ): AccountLoad[] {
    const addressAssetIdsMap = new Map<string, Set<KnownCaip19AssetId>>();

    for (const transaction of getTransactions(rootTransaction)) {
      const addresses = [transaction.account];
      if (transaction.destination !== undefined) {
        addresses.push(transaction.destination);
      }
      const assetIds = transaction.iouAssetIds;

      for (const address of addresses) {
        // Skip the source account, we already loaded it
        if (address === source.accountId) {
          continue;
        }

        const assetIdsSet =
          addressAssetIdsMap.get(address) ?? new Set<KnownCaip19AssetId>();

        for (const assetId of assetIds) {
          assetIdsSet.add(assetId);
        }

        addressAssetIdsMap.set(address, assetIdsSet);
      }

      for (const assetId of assetIds) {
        const { assetIssuer } = parseIouAsset(assetId);
        if (
          assetIssuer === source.accountId ||
          addressAssetIdsMap.has(assetIssuer)
        ) {
          continue;
        }
        addressAssetIdsMap.set(assetIssuer, new Set());
      }
    }

    return [...addressAssetIdsMap.entries()].map(([address, assetIds]) => ({
      address,
      assetIds: [...assetIds],
    }));
  }

  /**
   * Submits an already-signed transaction blob (`fail_hard`). Does not sign or
   * autofill. A `tefPAST_SEQ` or `terPRE_SEQ` result is not retried.
   *
   * @see https://xrpl.org/docs/concepts/transactions/reliable-transaction-submission
   *
   * @param params - Options object.
   * @param params.scope - The CAIP-2 chain ID.
   * @param params.signedTransaction - Signed XRPL `tx_blob` hex.
   * @returns The transaction hash from a `tesSUCCESS` submit.
   * @throws {TransactionRetryableException} When rippled reports a sequence mismatch.
   * @throws {TransactionSendException} When submission fails for another reason.
   */
  async sendTransaction(params: {
    scope: KnownCaip2ChainId;
    signedTransaction: string;
  }): Promise<string> {
    const { scope, signedTransaction } = params;
    assert(signedTransaction, XrplTransactionStringStruct);
    return this.#networkService.sendTransaction(signedTransaction, scope);
  }

  /**
   * Finds all pending transactions for the given account ID from snap state.
   *
   * @param accountId - The account ID to find transactions for.
   * @returns A promise that resolves to an array of transactions.
   */
  async findByAccountId(accountId: string): Promise<KeyringTransaction[]> {
    return this.#transactionRepository.findByAccountId(accountId);
  }

  /**
   * Emits `AccountTransactionsUpdated`, then persists the transaction to snap state.
   *
   * Emit runs first so a failed emit skips the save and the caller can retry. If save
   * fails after a successful emit, the controller already has the update.
   *
   * @param transaction - The transaction to emit and save.
   */
  async #saveAndEmit(transaction: KeyringTransaction): Promise<void> {
    await emitAccountTransactionsUpdated([transaction]);
    await this.#transactionRepository.save(transaction);
  }

  /**
   * Looks up a transaction by hash on rippled.
   *
   * @param txId - XRPL transaction hash.
   * @param scope - CAIP-2 network.
   * @returns Wrapped transaction with status from `validated` / `meta`.
   */
  async fetchTransaction(
    txId: string,
    scope: KnownCaip2ChainId,
  ): Promise<Transaction> {
    const response = await this.#networkService.fetchTransaction(txId, scope);
    const txJson = response.tx_json;
    if (txJson === undefined) {
      throw new TransactionDeserializationException({
        cause: new Error(`Transaction ${txId} response omitted tx_json`),
      });
    }
    return new Transaction(txJson, scope, {
      status: statusFromTxResponse(response),
    });
  }

  /**
   * Refreshes keyring transaction history for activated accounts.
   *
   * @param _activatedAccountPairs - Funded keyring + on-chain account pairs.
   * @param _scope - CAIP-2 network scope.
   */
  async synchronize(
    _activatedAccountPairs: ActivatedAccountPair[],
    _scope: KnownCaip2ChainId,
  ): Promise<void> {
    // TODO: Implement transaction synchronization
  }
}
