import { isNullOrUndefined } from '@metamask/utils';
import { cloneDeep } from 'lodash';
import type { Payment, Transaction as XrplTransaction } from 'xrpl';

import type { KnownCaip2ChainId } from '../../api';
import { LEDGER_SEQUENCE_OFFSET } from '../../constants';
import { LedgerState, XrplTransactionType } from '../network';
import type { NetworkService } from '../network';
import { BatchInnerTransactionStruct } from './api';
import { TransactionAutofillerException } from './exceptions';
import { Transaction } from './Transaction';
import type { TransactionFeeEstimator } from './TransactionFeeEstimator';

export const TransactionAutofillerFillItems = {
  sequence: 'sequence',
  fee: 'fee',
  lastLedgerSequence: 'lastLedgerSequence',
  batch: 'batch',
} as const;

export type TransactionAutofillerFillItem =
  (typeof TransactionAutofillerFillItems)[keyof typeof TransactionAutofillerFillItems];

/** Default: fill every autofill field when missing (or when `forceRefresh`). */
export const ALL_TRANSACTION_AUTOFILLER_FILL_ITEMS: ReadonlySet<TransactionAutofillerFillItem> =
  new Set(Object.values(TransactionAutofillerFillItems));

export type TransactionAutofillerOptions = {
  forceRefresh?: boolean;
  useCache?: boolean;
  /**
   * Fields to fill. Omit to fill all missing fields. Pass a subset (e.g. fee
   * only) for cheaper amount-input preflight.
   */
  fillItems?: ReadonlySet<TransactionAutofillerFillItem>;
};

export class TransactionAutofiller {
  readonly #networkService: NetworkService;
  readonly #transactionFeeEstimator: TransactionFeeEstimator;

  constructor({
    networkService,
    transactionFeeEstimator,
  }: {
    networkService: NetworkService;
    transactionFeeEstimator: TransactionFeeEstimator;
  }) {
    this.#networkService = networkService;
    this.#transactionFeeEstimator = transactionFeeEstimator;
  }

  /**
   * Fills XRPL autofill fields on raw transaction JSON using rippled JSON-RPC.
   *
   * Returns a shallow copy (deep-copied batch inners) so confirmation UI state
   * is not mutated. `NetworkID` is never set. This snap only supports mainnet,
   * and mainnet must omit that field or rippled rejects the blob with
   * `telNETWORK_ID_MAKES_TX_NON_CANONICAL`. Selected missing fields are loaded
   * in parallel. When `forceRefresh` is set, selected fields are written again.
   *
   * @param transaction - Unsigned XRPL JSON.
   * @param scope - CAIP-2 chain ID used to choose the rippled client.
   * @param options - Autofill options.
   * @param options.forceRefresh - When true, selected fields are fetched again.
   * @param options.useCache - When true, reuse cached network reads (amount-input preflight).
   * @param options.fillItems - Fields to fill. Omit for all fields.
   * @returns Filled XRPL JSON ready to wrap or sign.
   * @throws {TransactionAutofillerException} When `Account` is missing for sequence fill, or a batch inner is invalid.
   */
  async autofill(
    transaction: XrplTransaction,
    scope: KnownCaip2ChainId,
    options: TransactionAutofillerOptions = {},
  ): Promise<XrplTransaction> {
    const forceRefresh = options.forceRefresh === true;
    const useCache = options.useCache === true;
    const fillItems =
      options.fillItems ?? ALL_TRANSACTION_AUTOFILLER_FILL_ITEMS;
    const raw = cloneDeep(transaction);

    if (raw.TransactionType === XrplTransactionType.Payment) {
      this.#applyDeliverMax(raw);
    }

    await Promise.all([
      this.#shouldFill({
        fillItems,
        key: TransactionAutofillerFillItems.sequence,
        forceRefresh,
        isMissing: isNullOrUndefined(raw.Sequence),
      })
        ? this.fillSequence(raw, scope, useCache)
        : Promise.resolve(),
      this.#shouldFill({
        fillItems,
        key: TransactionAutofillerFillItems.fee,
        forceRefresh,
        isMissing: isNullOrUndefined(raw.Fee),
      })
        ? this.fillFee(raw, scope, useCache)
        : Promise.resolve(),
      this.#shouldFill({
        fillItems,
        key: TransactionAutofillerFillItems.lastLedgerSequence,
        forceRefresh,
        isMissing: isNullOrUndefined(raw.LastLedgerSequence),
      })
        ? this.fillLastLedgerSequence(raw, scope, useCache)
        : Promise.resolve(),
      raw.TransactionType === XrplTransactionType.Batch &&
      fillItems.has(TransactionAutofillerFillItems.batch)
        ? this.autofillBatch(raw, scope, forceRefresh, useCache)
        : Promise.resolve(),
    ]);

    return raw;
  }

  /**
   * Whether a selected autofill field should be written on this pass.
   *
   * @param params - Selection, refresh flag, and whether the field is absent.
   * @returns True when the field is selected and missing, or selected and force-refreshed.
   */
  #shouldFill(params: {
    fillItems: ReadonlySet<TransactionAutofillerFillItem>;
    key: TransactionAutofillerFillItem;
    forceRefresh: boolean;
    isMissing: boolean;
  }): boolean {
    const { fillItems, key, forceRefresh, isMissing } = params;
    if (!fillItems.has(key)) {
      return false;
    }
    return forceRefresh || isMissing;
  }

  /**
   * Sets `Sequence` from the account's sequence on the current ledger.
   *
   * @param transaction - Raw transaction whose `Account` is loaded.
   * @param scope - CAIP-2 chain ID used to choose the rippled client.
   * @throws {TransactionAutofillerException} When `Account` is missing.
   */
  async fillSequence(
    transaction: XrplTransaction,
    scope: KnownCaip2ChainId,
    useCache: boolean = false,
  ): Promise<void> {
    const { Account: account } = transaction;
    if (account === undefined || account === '') {
      throw new TransactionAutofillerException(
        'Transaction is missing Account, so Sequence cannot be filled',
      );
    }
    transaction.Sequence = await this.#loadCurrentSequence(
      account,
      scope,
      useCache,
    );
  }

  /**
   * Sets `Fee` from {@link TransactionFeeEstimator.estimateFee}.
   *
   * @param transaction - Raw transaction to price.
   * @param scope - CAIP-2 chain ID passed to the fee lookup.
   * @param useCache - When true, reuse a cached base fee.
   */
  async fillFee(
    transaction: XrplTransaction,
    scope: KnownCaip2ChainId,
    useCache: boolean = false,
  ): Promise<void> {
    const wrapped = new Transaction(transaction, scope);
    const fee = await this.#transactionFeeEstimator.estimateFee({
      transaction: wrapped,
      scope,
      useCache,
    });
    transaction.Fee = fee.toFixed(0);
  }

  /**
   * Sets `LastLedgerSequence` to the latest validated ledger plus {@link LEDGER_SEQUENCE_OFFSET}.
   *
   * @param transaction - Raw transaction to update.
   * @param scope - CAIP-2 chain ID used to choose the rippled client.
   * @param useCache - When true, reuse a cached ledger index.
   */
  async fillLastLedgerSequence(
    transaction: XrplTransaction,
    scope: KnownCaip2ChainId,
    useCache: boolean = false,
  ): Promise<void> {
    const ledgerIndex = await this.#networkService.fetchValidatedLedgerIndex(
      scope,
      {
        cache: useCache,
      },
    );
    transaction.LastLedgerSequence = ledgerIndex + LEDGER_SEQUENCE_OFFSET;
  }

  /**
   * Reads the next usable sequence for `account` on the current ledger.
   *
   * @param account - Classic account address.
   * @param scope - CAIP-2 chain ID used to choose the rippled client.
   * @param useCache - When true, reuse a cached account_info read.
   * @returns The account sequence.
   */
  async #loadCurrentSequence(
    account: string,
    scope: KnownCaip2ChainId,
    useCache: boolean = false,
  ): Promise<number> {
    const loaded = await this.#networkService.fetchAccountInfo(
      account,
      scope,
      LedgerState.Current,
      { cache: useCache },
    );
    return Number(loaded.account_data.Sequence);
  }

  /**
   * Fills each inner transaction of a `Batch` on the given raw JSON.
   *
   * @param transaction - Outer batch raw JSON (already cloned).
   * @param scope - CAIP-2 chain ID used to choose the rippled client.
   * @param forceRefresh - When true, inner sequence is written again.
   * @param useCache - When true, reuse cached account_info reads.
   * @throws {TransactionAutofillerException} When an inner fails the struct.
   */
  async autofillBatch(
    transaction: XrplTransaction,
    scope: KnownCaip2ChainId,
    forceRefresh: boolean,
    useCache: boolean = false,
  ): Promise<void> {
    if (transaction.TransactionType !== XrplTransactionType.Batch) {
      return;
    }
    const inners = transaction.RawTransactions;

    const parsed = inners.map((entry) => {
      if (!BatchInnerTransactionStruct.is(entry.RawTransaction)) {
        throw new TransactionAutofillerException(
          'Inner Batch transaction failed validation',
        );
      }
      return entry.RawTransaction;
    });

    const accountsToLoad = new Set<string>();
    for (const inner of parsed) {
      if (!this.#batchInnerNeedsSequence(inner, forceRefresh)) {
        continue;
      }
      accountsToLoad.add(inner.Account);
    }

    const nextSequence = new Map<string, number>();
    await Promise.all(
      [...accountsToLoad].map(async (account) => {
        const current = await this.#loadCurrentSequence(
          account,
          scope,
          useCache,
        );
        const sequence =
          account === transaction.Account ? current + 1 : current;
        nextSequence.set(account, sequence);
      }),
    );

    for (const inner of parsed) {
      if (this.#batchInnerNeedsSequence(inner, forceRefresh)) {
        const { Account: account } = inner;
        const sequence = nextSequence.get(account);
        if (sequence === undefined) {
          throw new TransactionAutofillerException(
            'Inner Batch transaction is missing a sequence',
          );
        }
        inner.Sequence = sequence;
        nextSequence.set(account, sequence + 1);
      }
      // Batch inner transactions MUST have no fee or signing pubkey.
      inner.Fee = '0';
      inner.SigningPubKey = '';
    }
  }

  /**
   * Whether a batch inner still needs a sequence assigned.
   *
   * @param inner - Inner transaction already checked by {@link BatchInnerTransactionStruct}.
   * @param forceRefresh - When true, a sequence is assigned again unless a ticket is set.
   * @returns True when this autofill pass should write `Sequence`.
   */
  #batchInnerNeedsSequence(
    inner: { Sequence?: number; TicketSequence?: number },
    forceRefresh: boolean,
  ): boolean {
    if (inner.TicketSequence !== undefined) {
      return false;
    }
    if (forceRefresh) {
      return true;
    }
    return (
      isNullOrUndefined(inner.TicketSequence) &&
      isNullOrUndefined(inner.Sequence)
    );
  }

  /**
   * Copies `DeliverMax` onto `Amount` for a payment, then removes `DeliverMax`.
   *
   * @param transaction - Transaction JSON. Only `Payment` is changed.
   * @throws {TransactionAutofillerException} When `Amount` and `DeliverMax` are both set and differ.
   */
  #applyDeliverMax(transaction: Payment): void {
    const { DeliverMax: deliverMax } = transaction;
    if (isNullOrUndefined(deliverMax)) {
      return;
    }
    if (isNullOrUndefined(transaction.Amount)) {
      transaction.Amount = deliverMax;
    } else if (!paymentAmountsEqual(transaction.Amount, deliverMax)) {
      throw new TransactionAutofillerException(
        'Payment Amount and DeliverMax must be identical when both are provided',
      );
    }
    delete transaction.DeliverMax;
  }
}

/**
 * Whether two payment amounts are the same drops string or the same issued
 * currency. Object identity is not enough: equal IOU amounts are different
 * objects.
 *
 * @param left - Payment `Amount`.
 * @param right - Payment `DeliverMax`.
 * @returns True when both amounts would deliver the same value.
 */
function paymentAmountsEqual(
  left: Payment['Amount'],
  right: NonNullable<Payment['DeliverMax']>,
): boolean {
  if (typeof left === 'string' || typeof right === 'string') {
    return left === right;
  }
  if (isIouPaymentAmt(left) && isIouPaymentAmt(right)) {
    return (
      left.currency === right.currency &&
      left.issuer === right.issuer &&
      left.value === right.value
    );
  }
  if (isMptPaymentAmt(left) && isMptPaymentAmt(right)) {
    return (
      left.mpt_issuance_id === right.mpt_issuance_id &&
      left.value === right.value
    );
  }
  return false;
}

/**
 * @param amount - Payment amount object.
 * @returns Whether the amount is an issued currency.
 */
function isIouPaymentAmt(
  amount: object,
): amount is { currency: string; issuer: string; value: string } {
  return Object.hasOwn(amount, 'currency') && Object.hasOwn(amount, 'issuer');
}

/**
 * @param amount - Payment amount object.
 * @returns Whether the amount is an MPT amount.
 */
function isMptPaymentAmt(
  amount: object,
): amount is { mpt_issuance_id: string; value: string } {
  return Object.hasOwn(amount, 'mpt_issuance_id');
}
