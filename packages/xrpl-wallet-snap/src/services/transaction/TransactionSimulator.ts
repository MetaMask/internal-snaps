import type { Logger } from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';
import { validate } from 'xrpl';

import { XrplAddressStruct } from '../../api';
import type {
  KnownCaip19IouAssetId,
  KnownCaip19MptAssetId,
  KnownCaip2ChainId,
} from '../../api';
import type { AnyErrorConstructor } from '../../utils';
import { isIouAssetId, isMptId } from '../../utils';
import { XrplTransactionType } from '../network/api';
import { DestinationAccountNotActivatedException } from '../network/exceptions';
import type { NetworkService } from '../network/NetworkService';
import { OnChainAssetType } from '../on-chain-account';
import type { OnChainAccount } from '../on-chain-account/OnChainAccount';
import {
  DepositNotAuthorizedException,
  InsufficientBalanceToCoverFeeException,
  TransactionValidationException,
  UnsupportedTransactionTypeException,
} from './exceptions';
import type {
  AccountState,
  LineState,
  MptState,
  SimulationState,
} from './simulation';
import {
  MPTokenAuthorizeSimulator,
  PaymentSimulator,
  TrustSetSimulator,
  getAccount,
  getSpendable,
} from './simulation';
import type { Transaction } from './Transaction';
import {
  assertAccountScopeMatch,
  assertTransactionScope,
  normalizeTransactions,
} from './utils';

/**
 * Options for {@link TransactionSimulator.simulate}.
 */
export type TransactionSimulatorOptions = {
  skipExceptions?: readonly AnyErrorConstructor[];
  useCache?: boolean;
};

/**
 * Checks a transaction against ledger snapshots it loads itself.
 *
 * A `Batch` is walked inner by inner. Each inner is validated and applied on
 * its own clone, so it sees the balances left by the ones before it.
 * Deposit authorization is rejected here, before the payment simulator runs.
 */
export class TransactionSimulator {
  readonly #simulators: {
    [XrplTransactionType.Payment]: PaymentSimulator;
    [XrplTransactionType.TrustSet]: TrustSetSimulator;
    [XrplTransactionType.MPTokenAuthorize]: MPTokenAuthorizeSimulator;
  };

  readonly #networkService: NetworkService;

  readonly #logger: Logger;

  constructor({
    networkService,
    logger,
  }: {
    networkService: NetworkService;
    logger: Logger;
  }) {
    this.#simulators = {
      [XrplTransactionType.Payment]: new PaymentSimulator(),
      [XrplTransactionType.TrustSet]: new TrustSetSimulator(),
      [XrplTransactionType.MPTokenAuthorize]: new MPTokenAuthorizeSimulator(),
    };
    this.#networkService = networkService;
    this.#logger = logger.withPrefix('[🧾 TransactionSimulator]');
  }

  /**
   * Simulates `transaction` against `account`.
   *
   * Preflight checks structure, scope, source account, and deposit authorization.
   * The fee is validated and applied first. Each payment or trust line is
   * then validated and applied on a clone of the previous snapshot.
   *
   * @param transaction - Autofilled unsigned transaction.
   * @param account - Source account. Its trust lines and spendable XRP are the starting snapshot.
   * @param invokedAccounts - Other accounts already loaded for this transaction.
   * @param options - Optional validation skips (destination tag / trust-line limit only).
   * @returns Stack of snapshots: the fee snapshot first, then one entry per payment or trust line.
   * @throws {TransactionValidationException} When the transaction cannot be submitted.
   */
  async simulate(
    transaction: Transaction,
    account: OnChainAccount,
    invokedAccounts: OnChainAccount[] = [],
    options?: TransactionSimulatorOptions,
  ): Promise<SimulationState[]> {
    const transactions = normalizeTransactions(transaction);
    await this.#preflightValidation(
      account,
      transaction,
      invokedAccounts,
      options?.useCache === true,
    );

    return this.#run({
      transactions,
      rootTransaction: transaction,
      initialState: this.#buildInitialState(account, invokedAccounts),
      skipExceptions: options?.skipExceptions,
    });
  }

  /**
   * Rejects a funded payment whose `deposit_authorized` result is false.
   *
   * A destination that is not in the ledger is skipped. Any other failure
   * from the lookup fails the simulation.
   *
   * @param transaction - Outer transaction.
   * @param source - Source account.
   * @param destinations - Destinations that exist on the ledger.
   * @param useCache - When true, reuse a cached `deposit_authorized` read.
   */
  async #validateIfDestinationAccountAuthorized(
    transaction: Transaction,
    source: OnChainAccount,
    destinations: OnChainAccount[],
    useCache: boolean = false,
  ): Promise<void> {
    const loadedAccounts = new Set(
      destinations.map((account) => account.accountId),
    );
    const payments = normalizeTransactions(transaction).filter(
      (payment) => payment.transactionType === XrplTransactionType.Payment,
    );

    this.#logger.debug(
      `Validating destination account authorization for transactions, length ${payments.length}`,
    );

    await Promise.all(
      payments.map(async (payment) => {
        const destination = this.#paymentDestination(payment);
        // Self-payments do not need deposit authorization. Unloaded destinations
        // are skipped here (native create-account); IOU rejects them later.
        if (
          destination === source.accountId ||
          !loadedAccounts.has(destination)
        ) {
          return;
        }

        let authorized = false;
        try {
          authorized = await this.#networkService.fetchDepositAuthorized(
            payment.account,
            destination,
            source.scope,
            { cache: useCache },
          );
        } catch (error: unknown) {
          // Safe guard to skip the validation if the destination account is not activated
          if (error instanceof DestinationAccountNotActivatedException) {
            return;
          }
          throw error;
        }
        if (!authorized) {
          throw new DepositNotAuthorizedException(payment.account, destination);
        }
      }),
    );
  }

  /**
   * Applies the fee, then validates and applies each payment or trust line.
   *
   * @param params - Transactions and the starting snapshot.
   * @param params.transactions - Payment and TrustSet transactions. A batch contributes its inners.
   * @param params.rootTransaction - Outer transaction. Its account pays the fee.
   * @param params.initialState - Source and preloaded accounts.
   * @returns Fee snapshot, then one snapshot per transaction.
   */
  #run(params: {
    transactions: Transaction[];
    rootTransaction: Transaction;
    initialState: SimulationState;
    skipExceptions?: readonly AnyErrorConstructor[];
  }): SimulationState[] {
    const { transactions, rootTransaction, initialState, skipExceptions } =
      params;

    // Always validate and apply the fee from the root transaction.
    // Batch inner transactions do not pay fees.
    const feeState = this.#validateAndApplyFeeState({
      state: this.#cloneSimulationState(initialState),
      sourceId: rootTransaction.account,
      fee: rootTransaction.fee,
    });

    return transactions.reduce<SimulationState[]>(
      (stack, transaction) => {
        const beforeState = stack[stack.length - 1];
        if (beforeState === undefined) {
          throw new TransactionValidationException(
            'Simulation failed: missing state snapshot',
          );
        }

        const state = this.#cloneSimulationState(beforeState);
        this.#validateAndApplyTransaction({
          transaction,
          state,
          scope: rootTransaction.scope,
          skipExceptions,
        });
        stack.push(state);
        return stack;
      },
      [feeState],
    );
  }

  /**
   * Rejects a transaction that cannot be simulated before any balance changes.
   *
   * @param account - Source account.
   * @param transaction - Outer transaction.
   * @param invokedAccounts - Destinations that exist on the ledger.
   * @param useCache - When true, reuse a cached `deposit_authorized` read.
   */
  async #preflightValidation(
    account: OnChainAccount,
    transaction: Transaction,
    invokedAccounts: OnChainAccount[],
    useCache: boolean = false,
  ): Promise<void> {
    assertTransactionScope(transaction, account.scope);

    try {
      validate(transaction.getRaw());
    } catch (error: unknown) {
      throw new TransactionValidationException(
        'Transaction failed structure validation',
        { cause: error },
      );
    }

    if (transaction.account !== account.accountId) {
      throw new TransactionValidationException(
        'Transaction Account does not match the source account',
      );
    }

    // Fail early if the destination account is not authorized
    await this.#validateIfDestinationAccountAuthorized(
      transaction,
      account,
      invokedAccounts,
      useCache,
    );
  }

  /**
   * Copies the source and preloaded accounts into the starting snapshot.
   *
   * @param source - Signing account.
   * @param invokedAccounts - Other accounts loaded for this transaction.
   * @returns Simulation state.
   */
  #buildInitialState(
    source: OnChainAccount,
    invokedAccounts: OnChainAccount[],
  ): SimulationState {
    const accounts = new Map<string, AccountState>([
      [source.accountId, this.#accountState(source)],
    ]);
    for (const preloaded of invokedAccounts) {
      assertAccountScopeMatch(preloaded, source.scope);
      if (!accounts.has(preloaded.accountId)) {
        accounts.set(preloaded.accountId, this.#accountState(preloaded));
      }
    }
    return { accounts };
  }

  /**
   * Copies one account snapshot.
   *
   * @param account - Bound account.
   * @returns Simulation state for that account.
   */
  #accountState(account: OnChainAccount): AccountState {
    const trustlines = new Map<KnownCaip19IouAssetId, LineState>();
    const mptokens = new Map<KnownCaip19MptAssetId, MptState>();
    for (const assetId of account.rawAssetIds) {
      const entry = account.getRawAsset(assetId);
      if (!entry) {
        continue;
      }
      if (isIouAssetId(entry.assetId) && entry.type === OnChainAssetType.Iou) {
        trustlines.set(entry.assetId, this.#lineState(entry));
        continue;
      }
      if (isMptId(entry.assetId) && entry.type === OnChainAssetType.Mpt) {
        mptokens.set(entry.assetId, this.#mptState(entry));
      }
    }

    return {
      nativeRawBalance: new BigNumber(account.nativeRawBalance),
      ownerCount: account.ownerCount,
      sponsoringAccountCount: account.sponsoringAccountCount,
      sponsoringOwnerCount: account.sponsoringOwnerCount,
      sponsoredOwnerCount: account.sponsoredOwnerCount,
      paysOwnBaseReserve: account.paysOwnBaseReserve,
      requireDestTag: account.requireDestTag,
      globalFreeze: account.flags?.lsfGlobalFreeze === true,
      trustlines,
      mptokens,
    };
  }

  /**
   * Ensures spendable XRP covers the fee, then deducts it.
   *
   * @param params - Snapshot, fee payer, and fee.
   * @param params.state - Cloned snapshot. This method mutates it.
   * @param params.sourceId - Account that pays the fee.
   * @param params.fee - Fee in drops.
   * @returns The same snapshot after the fee is reserved.
   */
  #validateAndApplyFeeState(params: {
    state: SimulationState;
    sourceId: string;
    fee: BigNumber;
  }): SimulationState {
    const { state, sourceId, fee } = params;
    const source = getAccount(state, sourceId);
    const spendable = getSpendable(source);
    if (spendable.isLessThan(fee)) {
      throw new InsufficientBalanceToCoverFeeException(
        spendable.toFixed(0),
        fee.toFixed(0),
      );
    }
    source.nativeRawBalance = source.nativeRawBalance.minus(fee);
    return state;
  }

  /**
   * Validates one payment or trust line, then applies it on the same snapshot.
   *
   * @param params - Transaction and snapshot.
   * @param params.transaction - Payment or TrustSet.
   * @param params.state - Snapshot to read and update.
   * @param params.scope - CAIP-2 chain ID.
   */
  #validateAndApplyTransaction(params: {
    transaction: Transaction;
    state: SimulationState;
    scope: KnownCaip2ChainId;
    skipExceptions?: readonly AnyErrorConstructor[];
  }): void {
    const { transaction, state, scope, skipExceptions } = params;
    const raw = transaction.getRaw();
    const ctx = { state, scope, skipExceptions };
    switch (raw.TransactionType) {
      case XrplTransactionType.Payment:
        this.#simulators[XrplTransactionType.Payment].validate(ctx, raw);
        this.#simulators[XrplTransactionType.Payment].apply(ctx, raw);
        return;
      case XrplTransactionType.TrustSet:
        this.#simulators[XrplTransactionType.TrustSet].validate(ctx, raw);
        this.#simulators[XrplTransactionType.TrustSet].apply(ctx, raw);
        return;
      case XrplTransactionType.MPTokenAuthorize:
        this.#simulators[XrplTransactionType.MPTokenAuthorize].validate(
          ctx,
          raw,
        );
        this.#simulators[XrplTransactionType.MPTokenAuthorize].apply(ctx, raw);
        return;
      default:
        throw new UnsupportedTransactionTypeException(
          transaction.transactionType,
        );
    }
  }

  /**
   * Copies a snapshot so a later transaction cannot change an earlier one.
   *
   * @param state - Snapshot to copy.
   * @returns An independent snapshot.
   */
  #cloneSimulationState(state: SimulationState): SimulationState {
    const accounts = new Map<string, AccountState>();
    for (const [accountId, accountState] of state.accounts) {
      accounts.set(accountId, {
        ...accountState,
        nativeRawBalance: new BigNumber(
          accountState.nativeRawBalance.toString(),
        ),
        trustlines: new Map(
          [...accountState.trustlines].map(([assetId, line]) => [
            assetId,
            this.#lineState(line),
          ]),
        ),
        mptokens: new Map(
          [...accountState.mptokens].map(([assetId, holding]) => [
            assetId,
            this.#mptState(holding),
          ]),
        ),
      });
    }
    return { accounts };
  }

  /**
   * Copies one trust line.
   *
   * @param line - Trust line balance, limit, and flags.
   * @returns An independent line.
   */
  #lineState(line: LineState): LineState {
    return {
      balance: new BigNumber(line.balance.toString()),
      limit: new BigNumber(line.limit.toString()),
      peerAuthorized: line.peerAuthorized,
      freeze: line.freeze,
      freezePeer: line.freezePeer,
    };
  }

  /**
   * Copies one MPT holding.
   *
   * @param holding - MPT amounts and flags.
   * @returns An independent holding.
   */
  #mptState(holding: MptState): MptState {
    return {
      balance: new BigNumber(holding.balance.toString()),
      mptAmount: new BigNumber(holding.mptAmount.toString()),
      lockedAmount: new BigNumber(holding.lockedAmount.toString()),
      mptAuthorized: holding.mptAuthorized,
    };
  }

  /**
   * Reads a payment destination.
   *
   * @param transaction - Payment transaction.
   * @returns Destination classic address.
   */
  #paymentDestination(transaction: Transaction): string {
    const { destination } = transaction;
    if (destination === undefined || !XrplAddressStruct.is(destination)) {
      throw new TransactionValidationException('Invalid destination address');
    }
    return destination;
  }
}
