import { KeyringEvent, TransactionStatus } from '@metamask/keyring-api';
import type { Transaction as KeyringTransaction } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import { groupBy } from 'lodash';
import type { Transaction as XrplTransaction } from 'xrpl';

import {
  ValidDestinationTagStruct,
  type KnownCaip19AssetIdOrSlip44Id,
  type KnownCaip2ChainId,
} from '../../api';
import { AppConfig } from '../../config';
import {
  getSlip44AssetId,
  getSnapProvider,
  getXrplAssetChainId,
  parseIouAssetCodeIssuer,
  toCaip19IouAssetId,
} from '../../utils';
import { XrplTransactionType } from '../network';
import type { OnChainAccount } from '../on-chain-account';
import type { XrplKeyringTransaction } from './api';
import { DraftBatchTxJsonStruct, DraftTxJsonStruct } from './api';
import {
  InvalidDestinationTagException,
  RequiresDestinationTagException,
  TransactionScopeNotMatchException,
  TransactionValidationException,
} from './exceptions';
import type { Transaction } from './Transaction';

export function isXrplTransaction(value: unknown): value is XrplTransaction {
  return DraftTxJsonStruct.is(value) || DraftBatchTxJsonStruct.is(value);
}

/**
 * Ensures the envelope’s network matches the expected chain before network I/O or simulation.
 *
 * @param transaction - Wrapped Xrpl transaction.
 * @param expectedScope - CAIP-2 chain ID the caller intends.
 * @throws {TransactionScopeNotMatchException} When {@link Transaction.scope} differs from `expectedScope`.
 */
export function assertTransactionScope(
  transaction: Transaction,
  expectedScope: KnownCaip2ChainId,
): void {
  const transactionScope = transaction.scope;
  if (transactionScope !== expectedScope) {
    throw new TransactionScopeNotMatchException(
      expectedScope,
      transactionScope,
    );
  }
}

/**
 * Whether the payment destination requires a destination tag.
 *
 * Looks up the destination only — IOU issuer accounts in `invokedAccounts`
 * must not trigger recovery UI.
 *
 * @param destination - Payment destination classic address.
 * @param invokedAccounts - Accounts preloaded for validation.
 * @returns `true` when the destination account has `lsfRequireDestTag`.
 */
export function isDestinationRequiresTag(
  destination: string,
  invokedAccounts: OnChainAccount[],
): boolean {
  return (
    invokedAccounts.find((account) => account.accountId === destination)
      ?.requireDestTag === true
  );
}

/**
 * Throws when the destination requires a tag and none is present, or when a
 * provided tag is not a valid XRPL `DestinationTag` (UInt32).
 *
 * @param destinationTag - Destination tag from the transaction, if any.
 * @param destAccountAddress - Payment destination classic address.
 * @param destRequiresTag - From {@link OnChainAccount.requireDestTag} or simulation state.
 * @throws {InvalidDestinationTagException} When `destinationTag` is set but invalid.
 * @throws {RequiresDestinationTagException} When a tag is required but missing.
 */
export function assertDestinationTagIfNeeded(
  destinationTag: number | undefined,
  destAccountAddress: string,
  destRequiresTag: boolean,
): void {
  if (
    destinationTag !== undefined &&
    !ValidDestinationTagStruct.is(destinationTag)
  ) {
    throw new InvalidDestinationTagException();
  }
  if (destRequiresTag && destinationTag === undefined) {
    throw new RequiresDestinationTagException(destAccountAddress);
  }
}

/**
 * Rejects a raw transaction that names a non-mainnet chain.
 *
 * Mainnet's network id is 0, and a mainnet transaction must omit `NetworkID`.
 * A set `NetworkID` means the blob is for a chain whose id is 1025 or higher.
 * Crafted transactions never set the field. This check is for a raw
 * transaction a caller asked the snap to sign.
 *
 * @param transaction - Wrapped transaction decoded from the request.
 * @throws {TransactionValidationException} When the outer transaction or a batch inner sets `NetworkID`.
 */
export function assertMainnetTransaction(transaction: Transaction): void {
  rejectNetworkId(transaction.getRaw());
}

/**
 * @param raw - Outer transaction, or one batch inner.
 * @throws {TransactionValidationException} When `NetworkID` is set.
 */
function rejectNetworkId(raw: XrplTransaction): void {
  if (raw.NetworkID !== undefined) {
    throw new TransactionValidationException(
      `Transaction targets network ${raw.NetworkID}. This snap only signs mainnet transactions, which omit NetworkID.`,
    );
  }
  if (raw.TransactionType !== 'Batch') {
    return;
  }
  for (const inner of raw.RawTransactions ?? []) {
    if (inner.RawTransaction.NetworkID !== undefined) {
      throw new TransactionValidationException(
        `Batch inner transaction targets network ${inner.RawTransaction.NetworkID}. This snap only signs mainnet transactions, which omit NetworkID.`,
      );
    }
  }
}

/**
 * Ensures a CAIP asset identifier belongs to the caller-provided scope.
 *
 * @param assetId - CAIP-19 or slip44 asset id.
 * @param expectedScope - CAIP-2 chain ID expected by caller.
 * @throws {TransactionValidationException} When the asset chain id differs from `expectedScope`.
 */
export function assertAssetScopeMatch(
  assetId: KnownCaip19AssetIdOrSlip44Id,
  expectedScope: KnownCaip2ChainId,
): void {
  const chainId = getXrplAssetChainId(assetId);
  if (chainId !== String(expectedScope)) {
    throw new TransactionValidationException(
      `Asset ${assetId} scope does not match expected scope ${expectedScope}`,
    );
  }
}

export function assertAccountScopeMatch(
  account: OnChainAccount,
  expectedScope: KnownCaip2ChainId,
): void {
  if (account.scope !== expectedScope) {
    throw new TransactionValidationException(
      `Account scope ${String(account.scope)} does not match expected scope ${String(expectedScope)}`,
    );
  }
}

/**
 * Maps a native or IOU asset reference to its CAIP-19 id.
 *
 * @param scope - CAIP-2 chain of the transaction.
 * @param assetReference - Either `'native'` or a classic `CODE.issuer` string.
 * @returns The CAIP-19 id, or `null` when the reference cannot be parsed.
 */
export function parseOperationAssetReferenceSafe(
  scope: KnownCaip2ChainId,
  assetReference: string,
): KnownCaip19AssetIdOrSlip44Id | null {
  if (assetReference === 'native') {
    return getSlip44AssetId(scope);
  }
  try {
    const { assetCode, assetIssuer } = parseIouAssetCodeIssuer(assetReference);
    return toCaip19IouAssetId(scope, assetCode, assetIssuer);
  } catch {
    return null;
  }
}

/**
 * Maps a rippled `tx` result to a keyring transaction status.
 *
 * @param response - Unwrapped `tx` result (`validated` + `meta`).
 * @returns Confirmed or failed when validated; submitted until then.
 */
export function statusFromTxResponse(response: {
  validated?: boolean;
  meta?: unknown;
}): TransactionStatus {
  if (response.validated !== true) {
    return TransactionStatus.Submitted;
  }
  const { meta } = response;
  if (
    meta !== null &&
    typeof meta === 'object' &&
    !Array.isArray(meta) &&
    Object.hasOwn(meta, 'TransactionResult')
  ) {
    const { TransactionResult: transactionResult } = meta as {
      TransactionResult?: unknown;
    };
    if (transactionResult === 'tesSUCCESS') {
      return TransactionStatus.Confirmed;
    }
  }
  return TransactionStatus.Failed;
}

/**
 * Detects if the transaction status is pending.
 *
 * @param status - The transaction status to check.
 * @returns Whether the transaction status is pending.
 */
export function isPendingTransactionStatus(
  status: KeyringTransaction['status'],
): boolean {
  return (
    status === `${TransactionStatus.Submitted}` ||
    status === `${TransactionStatus.Unconfirmed}`
  );
}

/**
 * Detects if the transaction status is terminal (confirmed or failed).
 *
 * @param status - The transaction status to check.
 * @returns Whether the transaction status is completed.
 */
export function isCompletedTransactionStatus(
  status: KeyringTransaction['status'],
): boolean {
  return (
    status === `${TransactionStatus.Failed}` ||
    status === `${TransactionStatus.Confirmed}`
  );
}

/**
 * Strips snap-internal reconcile metadata before exposing a transaction via keyring APIs.
 *
 * @param transaction - Snap-state transaction that may include `reconcileAttemptCount`.
 * @returns A pure keyring transaction.
 */
export function toKeyringTransaction(
  transaction: XrplKeyringTransaction,
): KeyringTransaction {
  const {
    reconcileAttemptCount: _reconcileAttemptCount,
    ...keyringTransaction
  } = transaction;
  return keyringTransaction;
}

/**
 * Converts a list of Xrpl transactions to a list of pure keyring transactions.
 *
 * @param transactions - Snap-state transactions that may include `reconcileAttemptCount`.
 * @returns Pure keyring transactions.
 */
export function toKeyringTransactions(
  transactions: XrplKeyringTransaction[],
): KeyringTransaction[] {
  return transactions.map(toKeyringTransaction);
}

/**
 * Checks if the pending transaction has exceeded the max reconcile attempts.
 *
 * @param reconcileAttemptCount - Number of ledger not-found reconcile attempts for a pending tx.
 * @returns Whether the reconcile attempt limit has been reached.
 */
export function isReconcileAttemptExceeded(
  reconcileAttemptCount: number = 0,
): boolean {
  return reconcileAttemptCount >= AppConfig.transaction.maxReconcileAttempts;
}

/**
 * Checks if the pending transaction has exceeded the max pending transaction age.
 *
 * @param timestamp - Transaction creation time in seconds since epoch.
 * @returns Whether the pending transaction is older than the configured max age.
 */
export function isMaxPendingTransactionAgeExceeded(
  timestamp?: number | null,
): boolean {
  if (timestamp === undefined || timestamp === null) {
    return false;
  }

  return (
    Date.now() - timestamp * 1000 >
    AppConfig.transaction.maxPendingTransactionAge
  );
}

/**
 * Whether a pending transaction should be evicted from snap state.
 *
 * Both reconcile attempts and max age must be exceeded so frequent account-switch
 * syncs cannot drop a pending tx before it has had enough wall-clock time.
 *
 * @param transaction - Pending transaction with optional reconcile metadata.
 * @param transaction.reconcileAttemptCount - Ledger not-found reconcile attempts for this pending tx.
 * @param transaction.timestamp - Transaction creation time in seconds since epoch.
 * @returns Whether the pending tx should be dropped from snap state.
 */
export function shouldDropPendingTransaction(
  transaction: Pick<
    XrplKeyringTransaction,
    'reconcileAttemptCount' | 'timestamp'
  >,
): boolean {
  return (
    isReconcileAttemptExceeded(transaction.reconcileAttemptCount ?? 0) &&
    isMaxPendingTransactionAgeExceeded(transaction.timestamp)
  );
}

/**
 * Emits {@link KeyringEvent.AccountTransactionsUpdated} grouped by account id.
 *
 * @param transactions - Keyring transactions to include in the event payload.
 */
export async function emitAccountTransactionsUpdated(
  transactions: KeyringTransaction[],
): Promise<void> {
  const transactionsByAccountId = groupBy(transactions, 'account');

  await emitSnapKeyringEvent(
    getSnapProvider(),
    KeyringEvent.AccountTransactionsUpdated,
    {
      transactions: transactionsByAccountId,
    },
  );
}

/**
 * Canonicalizes a transaction to a list of transactions.
 * If the transaction is a batch transaction, it returns the inner transactions.
 * Otherwise, it returns the transaction itself.
 *
 * @param transaction - The batch transaction.
 * @returns The canonicalized list of transactions.
 */
export function getTransactions(transaction: Transaction): Transaction[] {
  if (transaction.transactionType === XrplTransactionType.Batch) {
    return transaction.innerTransactions;
  }
  return [transaction];
}

/**
 * Whether the transaction JSON already carries a signature.
 *
 * @param transaction - XRPL transaction JSON.
 * @returns True when `TxnSignature` or multi-sign `Signers` are present.
 */
export function isSignedTransaction(transaction: XrplTransaction): boolean {
  if (
    typeof transaction.TxnSignature === 'string' &&
    transaction.TxnSignature.length > 0
  ) {
    return true;
  }
  const { Signers } = transaction;
  return Array.isArray(Signers) && Signers.length > 0;
}

/**
 * Validate if the amount is a valid MPT payment amount.
 *
 * @param amount - Payment `Amount`.
 * @returns Whether the amount carries `mpt_issuance_id`.
 */
export function isMptPaymentAmt(
  amount: unknown,
): amount is { mpt_issuance_id: string; value: string } {
  return (
    typeof amount === 'object' &&
    amount !== null &&
    Object.hasOwn(amount, 'mpt_issuance_id')
  );
}

/**
 * Validate if the amount is a valid IOU payment amount.
 *
 * @param amount - Payment `Amount`.
 * @returns Whether the amount carries `currency` and `issuer`.
 */
export function isIouPaymentAmt(
  amount: unknown,
): amount is { currency: string; issuer: string; value: string } {
  return (
    typeof amount === 'object' &&
    amount !== null &&
    Object.hasOwn(amount, 'currency') &&
    Object.hasOwn(amount, 'issuer')
  );
}
