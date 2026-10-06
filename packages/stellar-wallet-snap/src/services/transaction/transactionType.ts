import { TransactionType } from '@metamask/keyring-api';

import type { Transaction } from './Transaction';
import {
  isAddChangeTrustTransaction,
  isReceiveTransaction,
  isRemoveChangeTrustTransaction,
  isSendTransaction,
  isSwapTransaction,
} from './utils';

/**
 * Classifies a Stellar transaction from its operations.
 *
 * Cases are checked in activity-mapping order:
 * 1. A payment or create-account from the account is a send.
 * 2. A path payment to the same account is a swap.
 * 3. A trustline change is a token approval or disapproval.
 * 4. An incoming credit is a receive.
 * 5. Every other shape, including a Soroban invoke, is `unknown`.
 *
 *
 * @param transaction - The transaction to classify.
 * @param accountAddress - The Stellar address the classification is relative to.
 * @returns The classification to report.
 */
export function resolveTransactionType(
  transaction: Transaction,
  accountAddress: string,
): TransactionType {
  if (isSendTransaction(transaction, accountAddress)) {
    return TransactionType.Send;
  }

  if (isSwapTransaction(transaction, accountAddress)) {
    return TransactionType.Swap;
  }

  if (isAddChangeTrustTransaction(transaction, accountAddress)) {
    return TransactionType.TokenApprove;
  }

  if (isRemoveChangeTrustTransaction(transaction, accountAddress)) {
    return TransactionType.TokenDisapprove;
  }

  if (isReceiveTransaction(transaction, accountAddress)) {
    return TransactionType.Receive;
  }

  return TransactionType.Unknown;
}
