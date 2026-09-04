import { parseProofOfOwnershipMessage as parseSharedProofOfOwnershipMessage } from '@metamask/snap-networks-utils';
import type { ProofOfOwnershipMessage } from '@metamask/snap-networks-utils';

import { StellarAddressStruct } from '../../api/address';
import type { Transaction } from '../../services/transaction';
import {
  InsufficientBalanceException,
  InsufficientBalanceToCoverBaseReserveException,
  InsufficientBalanceToCoverFeeException,
  InvalidAmountForCreateAccountException,
  InvalidAssetForCreateAccountException,
  RemoveTrustlineWithNonZeroBalanceException,
  RequiresMemoException,
  TransactionExpireException,
  TransactionValidationException,
  TrustlineExceedLimitException,
  TrustlineNotAuthorizedException,
  TrustlineNotFoundException,
  UpdateTrustlineException,
} from '../../services/transaction';
import type { LocalizedMessage } from '../../utils';

/**
 * Guards the user-approved fee during submit-time transaction refresh.
 *
 * Fee is visible in the confirmation dialog, so we fail closed instead of
 * silently signing a refreshed transaction with a higher fee than the user saw.
 *
 * @param params - Confirmed and refreshed transaction pair.
 * @param params.confirmedTransaction - Transaction shown in the confirmation dialog.
 * @param params.refreshedTransaction - Transaction rebuilt after confirmation from fresh on-chain state.
 * @throws {TransactionValidationException} When the refreshed fee is higher than the confirmed fee.
 */
export function assertRefreshedTransactionFeeNotHigher(params: {
  confirmedTransaction: Transaction;
  refreshedTransaction: Transaction;
}): void {
  // We only check the fee here, not the operations. That's fine for send and
  // change-trust: the rebuild keeps the same asset, amount and destination from
  // the request, so the only thing that can change is payment vs createAccount
  // (when the destination gets funded/unfunded), and both move the same funds.
  const { confirmedTransaction, refreshedTransaction } = params;
  if (refreshedTransaction.totalFee.gt(confirmedTransaction.totalFee)) {
    throw new TransactionValidationException(
      'Refreshed transaction fee exceeds confirmed fee',
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
  error: TransactionValidationException,
  senderAddress: string,
): LocalizedMessage {
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
