import { StellarAddressStruct } from '../../api/address';
import { TransactionValidationException } from '../../services/transaction';
import type { Transaction } from '../../services/transaction';

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
 * Parses a proof-of-ownership message of format
 * `'metamask:proof-of-ownership:{nonce}:{address}'`.
 * Splits on the last `:` so opaque nonces may contain colons.
 *
 * @param message - The plaintext proof-of-ownership message.
 * @returns The parsed nonce and Stellar address.
 * @throws Error if the message format is invalid.
 */
export function parseProofOfOwnershipMessage(message: string): {
  nonce: string;
  address: string;
} {
  const messagePrefix = 'metamask:proof-of-ownership:';

  if (!message.startsWith(messagePrefix)) {
    throw new Error(`Message must start with "${messagePrefix}"`);
  }

  const remainder = message.slice(messagePrefix.length);
  const separatorIdx = remainder.lastIndexOf(':');
  if (separatorIdx === -1) {
    throw new Error(
      'Message must follow the format "metamask:proof-of-ownership:{nonce}:{address}"',
    );
  }

  const nonce = remainder.slice(0, separatorIdx);
  const address = remainder.slice(separatorIdx + 1);

  if (nonce === '') {
    throw new Error(
      'Proof-of-ownership message must contain a non-empty nonce',
    );
  }

  if (!StellarAddressStruct.is(address)) {
    throw new Error('Invalid Stellar address in proof-of-ownership message');
  }

  return { nonce, address };
}
