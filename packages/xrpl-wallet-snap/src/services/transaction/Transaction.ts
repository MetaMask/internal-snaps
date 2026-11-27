import { TransactionStatus } from '@metamask/keyring-api';
import { assert } from '@metamask/superstruct';
import { BigNumber } from 'bignumber.js';
import { decode, encode, hashes, validate } from 'xrpl';
import type { Transaction as XrplTransaction } from 'xrpl';

import type { KnownCaip19IouAssetId, KnownCaip19MptAssetId } from '../../api';
import { KnownCaip2ChainId } from '../../api';
import { toCaip19IouAssetId, toCaip19MptAssetId } from '../../utils';
import { TxJsonStruct, XrplTransactionType } from '../network/api';
import type { TxJson } from '../network/api';
import type { DraftTxJson } from './api';
import { TransactionDeserializationException } from './exceptions';
import {
  isIouPaymentAmt,
  isMptPaymentAmt,
  isSignedTransaction,
  isXrplTransaction,
} from './utils';

type TransactionRawData = DraftTxJson | TxJson | XrplTransaction;

/**
 * Snap-domain wrapper around unsigned or signed XRPL transaction JSON.
 *
 * Protocol fill (sequence, fee, last ledger) belongs on raw JSON via
 * {@link TransactionAutofiller.autofill}, not on this class.
 */
export class Transaction {
  readonly #status: TransactionStatus;

  readonly #scope: KnownCaip2ChainId;

  #rawData: TransactionRawData;

  #innerTransactions: Transaction[] = [];

  constructor(
    inner: TransactionRawData,
    scope: KnownCaip2ChainId,
    {
      status,
    }: {
      status?: TransactionStatus;
    } = {},
  ) {
    this.#scope = scope;
    this.#rawData = inner;
    this.#status = status ?? TransactionStatus.Submitted;
    this.refresh();
  }

  /**
   * Rebuilds cached batch inner wrappers from the current raw JSON.
   *
   * Call after mutating `RawTransactions` on the raw object (for example after
   * wrapping an autofilled batch).
   */
  refresh(): void {
    if (this.#rawData.TransactionType === XrplTransactionType.Batch) {
      this.#innerTransactions =
        this.#rawData.RawTransactions?.map((innerTransaction) => {
          return new Transaction(innerTransaction.RawTransaction, this.#scope);
        }) ?? [];
      return;
    }
    this.#innerTransactions = [];
  }

  /**
   * Replaces the underlying XRPL JSON and refreshes batch inners.
   *
   * @param raw - Filled or updated transaction JSON.
   * @returns This wrapper for chaining.
   */
  withRaw(raw: TransactionRawData): this {
    this.#rawData = raw;
    this.refresh();
    return this;
  }

  /**
   * Transaction hash. Uses {@link hashes.hashSignedTx} when signed;
   * {@link hashes.hashTx} on the encoded blob for unsigned drafts.
   *
   * @returns Hex transaction hash.
   */
  get hash(): string {
    return this.#calculateHash(this.#rawData as XrplTransaction);
  }

  get fee(): BigNumber {
    return new BigNumber(this.#rawData.Fee ?? 0);
  }

  set fee(fee: BigNumber) {
    this.#rawData.Fee = fee.toFixed(0);
  }

  get transactionType(): string {
    return this.#rawData.TransactionType;
  }

  get innerTransactions(): Transaction[] {
    return this.#innerTransactions;
  }

  get status(): TransactionStatus {
    return this.#status;
  }

  get scope(): KnownCaip2ChainId {
    return this.#scope;
  }

  /**
   * Account that will sign and pay the fee.
   *
   * @returns The `Account` field.
   */
  get account(): string {
    return this.#rawData.Account;
  }

  /**
   * Payment destination, when this transaction is a Payment.
   *
   * @returns The `Destination` field, or `undefined` for other types.
   */
  get destination(): string | undefined {
    const raw = this.getRaw();
    if (raw.TransactionType !== XrplTransactionType.Payment) {
      return undefined;
    }
    return raw.Destination;
  }

  /**
   * CAIP-19 IOU ids carried by this transaction.
   *
   * A Payment contributes one id from `Amount` when it is an issued currency.
   * A TrustSet contributes one id from `LimitAmount`. A Batch contributes the
   * ids from each inner. Native payments contribute nothing.
   *
   * @returns Distinct IOU asset ids, in first-seen order.
   */
  get iouAssetIds(): KnownCaip19IouAssetId[] {
    if (this.#rawData.TransactionType === XrplTransactionType.Batch) {
      const assetIds = new Set<KnownCaip19IouAssetId>();
      for (const inner of this.#innerTransactions) {
        for (const assetId of inner.iouAssetIds) {
          assetIds.add(assetId);
        }
      }
      return [...assetIds];
    }
    const assetId = this.#iouAssetIdFromRaw(this.getRaw());
    return assetId === undefined ? [] : [assetId];
  }

  /**
   * CAIP-19 MPT ids carried by this transaction.
   *
   * A Payment contributes one id from `Amount` when it is an MPT amount.
   * An `MPTokenAuthorize` contributes its `MPTokenIssuanceID`.
   * A Batch contributes the ids from each inner.
   *
   * @returns Distinct MPT asset ids, in first-seen order.
   */
  get mptAssetIds(): KnownCaip19MptAssetId[] {
    if (this.#rawData.TransactionType === XrplTransactionType.Batch) {
      const assetIds = new Set<KnownCaip19MptAssetId>();
      for (const inner of this.#innerTransactions) {
        for (const assetId of inner.mptAssetIds) {
          assetIds.add(assetId);
        }
      }
      return [...assetIds];
    }
    const assetId = this.#mptAssetIdFromRaw(this.getRaw());
    return assetId === undefined ? [] : [assetId];
  }

  /**
   * MPT id for a single Payment or MPTokenAuthorize.
   *
   * @param raw - Underlying XRPL JSON.
   * @returns The asset id, or `undefined` when this transaction has none.
   */
  #mptAssetIdFromRaw(raw: XrplTransaction): KnownCaip19MptAssetId | undefined {
    if (raw.TransactionType === XrplTransactionType.MPTokenAuthorize) {
      return toCaip19MptAssetId(this.#scope, raw.MPTokenIssuanceID);
    }
    if (raw.TransactionType !== XrplTransactionType.Payment) {
      return undefined;
    }
    const { Amount } = raw;
    if (!isMptPaymentAmt(Amount)) {
      return undefined;
    }
    return toCaip19MptAssetId(this.#scope, Amount.mpt_issuance_id);
  }

  /**
   * IOU id for a single Payment or TrustSet.
   *
   * @param raw - Underlying XRPL JSON.
   * @returns The asset id, or `undefined` when this transaction has none.
   */
  #iouAssetIdFromRaw(raw: XrplTransaction): KnownCaip19IouAssetId | undefined {
    if (raw.TransactionType === XrplTransactionType.TrustSet) {
      const { currency, issuer } = raw.LimitAmount;
      return toCaip19IouAssetId(this.#scope, currency, issuer);
    }
    if (raw.TransactionType !== XrplTransactionType.Payment) {
      return undefined;
    }
    const { Amount } = raw;
    if (!isIouPaymentAmt(Amount)) {
      return undefined;
    }
    return toCaip19IouAssetId(this.#scope, Amount.currency, Amount.issuer);
  }

  /**
   * Account sequence the transaction will use, when the JSON has set it.
   *
   * @returns The `Sequence` field, or `undefined` when it is omitted.
   */
  get sequence(): number | undefined {
    return this.#rawData.Sequence;
  }

  set sequence(sequence: number) {
    this.#rawData.Sequence = sequence;
  }

  /**
   * Last ledger sequence the transaction will use, when the JSON has set it.
   *
   * @returns The `LastLedgerSequence` field, or `undefined` when it is omitted.
   */
  get lastLedgerSequence(): number | undefined {
    return this.#rawData.LastLedgerSequence;
  }

  set lastLedgerSequence(lastLedgerSequence: number) {
    this.#rawData.LastLedgerSequence = lastLedgerSequence;
  }

  /**
   * Destination tag on a Payment.
   *
   * @returns The numeric `DestinationTag`, or `undefined` when this is not a
   * Payment or the field is omitted.
   */
  get destinationTag(): number | undefined {
    const raw = this.getRaw();
    if (raw.TransactionType !== XrplTransactionType.Payment) {
      return undefined;
    }
    return raw.DestinationTag;
  }

  /**
   * Unsigned or signed transaction JSON passed to the XRPL signer.
   *
   * @returns The inner transaction object.
   */
  getRaw(): XrplTransaction {
    return this.#rawData as XrplTransaction;
  }

  #calculateHash(transaction: XrplTransaction): string {
    if (isSignedTransaction(transaction)) {
      return hashes.hashSignedTx(transaction);
    }
    return hashes.hashTx(encode(transaction));
  }

  static fromTxResponse(
    response: XrplTransaction,
    scope: KnownCaip2ChainId,
  ): Transaction {
    return new Transaction(response, scope);
  }

  /**
   * Creates a wrapped transaction from draft or ledger XRPL JSON.
   *
   * @param transaction - XRPL transaction JSON.
   * @param scope - CAIP-2 network scope.
   * @returns Wrapped transaction.
   */
  static fromRaw(
    transaction: DraftTxJson | TxJson | XrplTransaction,
    scope: KnownCaip2ChainId,
  ): Transaction {
    try {
      validate(transaction);
      return new Transaction(transaction, scope);
    } catch (error: unknown) {
      throw new TransactionDeserializationException({
        cause: error,
      });
    }
  }

  /**
   * Creates a wrapped transaction from a signed transaction blob.
   *
   * @param params - Hex decode input.
   * @param params.txnString - Signed transaction hex.
   * @param params.scope - CAIP-2 network scope.
   * @returns Wrapped transaction.
   */
  static fromHex(params: {
    txnString: string;
    scope: KnownCaip2ChainId;
  }): Transaction {
    const { txnString, scope } = params;
    try {
      const decoded = decode(txnString);
      assert(decoded, TxJsonStruct);
      return Transaction.fromRaw(decoded, scope);
    } catch (error: unknown) {
      throw new TransactionDeserializationException({
        cause: error,
      });
    }
  }

  /**
   * Serializes the transaction to a binary hex blob (`encode`), suitable for
   * submit / Blockaid scan. This is not the signing-prefix payload.
   *
   * @returns XRPL transaction hex blob.
   */
  toString(): string {
    if (isXrplTransaction(this.#rawData)) {
      return encode(this.#rawData);
    }
    throw new TransactionDeserializationException();
  }
}
