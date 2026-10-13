import { parseProofOfOwnershipMessage as parseSharedProofOfOwnershipMessage } from '@metamask/snap-networks-utils';
import type { ProofOfOwnershipMessage } from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';

import { StellarAddressStruct } from '../../api/address';
import type { Transaction } from '../../services/transaction';
import {
  InsufficientBalanceException,
  InsufficientBalanceToCoverBaseReserveException,
  InsufficientBalanceToCoverFeeException,
  InvalidAmountForCreateAccountException,
  InvalidAssetForCreateAccountException,
  InvalidMemoException,
  RemoveTrustlineWithNonZeroBalanceException,
  RequiresMemoException,
  TransactionExpireException,
  TransactionValidationException,
  TrustlineExceedLimitException,
  TrustlineNotAuthorizedException,
  TrustlineNotFoundException,
  UpdateTrustlineException,
  resolveStellarMemo,
} from '../../services/transaction';
import type { LocalizedMessage } from '../../utils';

/**
 * Max allowed fee increase vs the fee on the confirmation-time draft (20%).
 *
 * SEP-41 / Soroban resource fees can move between dialog open and the
 * post-confirm rebuild; a small buffer avoids dropping otherwise-valid txs.
 * Baseline is the draft built when the dialog opened (not later UI refreshes).
 */
export const CONFIRMED_TRANSACTION_FEE_BUFFER_RATIO = new BigNumber('1.2');

/**
 * Guards the user-approved fee during submit-time transaction refresh.
 *
 * Allows the refreshed fee to be up to
 * {@link CONFIRMED_TRANSACTION_FEE_BUFFER_RATIO} times the fee on
 * {@link params.confirmedTransaction}. Larger increases fail closed.
 *
 * @param params - Confirmed and refreshed transaction pair.
 * @param params.confirmedTransaction - Draft transaction from when the confirmation dialog opened.
 * @param params.refreshedTransaction - Transaction rebuilt after confirmation from fresh on-chain state.
 * @throws {TransactionValidationException} When the refreshed fee exceeds the buffer.
 */
export function assertRefreshedTransactionFeeWithinBuffer(params: {
  confirmedTransaction: Transaction;
  refreshedTransaction: Transaction;
}): void {
  // We only check the fee here, not the operations. That's fine for send and
  // change-trust: the rebuild keeps the same asset, amount and destination from
  // the request, so the only thing that can change is payment vs createAccount
  // (when the destination gets funded/unfunded), and both move the same funds.
  const { confirmedTransaction, refreshedTransaction } = params;
  const maxAllowedFee = confirmedTransaction.totalFee.multipliedBy(
    CONFIRMED_TRANSACTION_FEE_BUFFER_RATIO,
  );
  if (refreshedTransaction.totalFee.gt(maxAllowedFee)) {
    throw new TransactionValidationException(
      'Refreshed transaction fee exceeds confirmed fee buffer',
    );
  }
}

/**
 * Maps a displayable transaction validation error to its confirmation banner copy.
 *
 * Shared by send and change-trust confirmations. Unmapped subclasses fall back
 * to `confirmation.txnError.generic`.
 *
 * @param error - The validation error shown in the confirmation banner.
 * @param senderAddress - The sender account address, used to tell destination
 * vs own-account trustline failures apart.
 * @returns The localized message key for the banner subtitle.
 */
export function getTxnErrorMessageKey(
  error: unknown,
  senderAddress: string,
): LocalizedMessage {
  if (error instanceof InvalidMemoException) {
    return 'confirmation.memo.error.tooLong';
  }
  if (error instanceof InsufficientBalanceException) {
    return 'confirmation.txnError.insufficientBalance';
  }
  if (error instanceof InsufficientBalanceToCoverFeeException) {
    return 'confirmation.txnError.insufficientBalanceToCoverFee';
  }
  if (error instanceof InsufficientBalanceToCoverBaseReserveException) {
    return 'confirmation.txnError.insufficientBalanceToCoverBaseReserve';
  }
  if (error instanceof RequiresMemoException) {
    return 'confirmation.txnError.requiresMemo';
  }
  if (error instanceof InvalidAmountForCreateAccountException) {
    return 'confirmation.txnError.invalidCreateAccountAmount';
  }
  if (error instanceof InvalidAssetForCreateAccountException) {
    return 'confirmation.txnError.invalidCreateAccountAsset';
  }
  if (error instanceof TrustlineNotAuthorizedException) {
    return 'confirmation.txnError.trustlineNotAuthorized';
  }
  if (error instanceof TrustlineNotFoundException) {
    return error.accountAddress === senderAddress
      ? 'confirmation.txnError.trustlineNotFoundOnAccount'
      : 'confirmation.txnError.trustlineNotFound';
  }
  if (error instanceof TrustlineExceedLimitException) {
    return 'confirmation.txnError.trustlineExceedLimit';
  }
  if (error instanceof RemoveTrustlineWithNonZeroBalanceException) {
    return 'confirmation.txnError.trustlineNonZeroBalance';
  }
  if (error instanceof UpdateTrustlineException) {
    return 'confirmation.txnError.updateTrustlineLimit';
  }
  if (error instanceof TransactionExpireException) {
    return 'confirmation.txnError.expired';
  }
  return 'confirmation.txnError.generic';
}

/**
 * Validates a memo the same way {@link resolveStellarMemo} attaches it.
 *
 * @param memo - Raw memo from the confirmation UI (may include whitespace).
 * @returns Locale error key, or `null` when empty/whitespace or valid.
 */
export function getMemoValidationErrorKey(
  memo: string,
): LocalizedMessage | null {
  try {
    resolveStellarMemo(memo);
    return null;
  } catch (error: unknown) {
    return getTxnErrorMessageKey(error, '');
  }
}

/**
 * Parses a proof-of-ownership message of format
 * `'metamask:proof-of-ownership:{nonce}:{address}'`.
 * Splits on the last `:` so opaque nonces may contain colons.
 *
 * @param message - The plaintext proof-of-ownership message.
 * @returns The parsed nonce and Stellar address.
 * @throws Error if the message format is invalid.
 */
export function parseProofOfOwnershipMessage(
  message: string,
): ProofOfOwnershipMessage {
  const proofMessage = parseSharedProofOfOwnershipMessage(message);
  const { address } = proofMessage;

  if (!StellarAddressStruct.is(address)) {
    throw new Error('Invalid Stellar address in proof-of-ownership message');
  }

  return proofMessage;
}
