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
 * The order matches activity mapping: a payment or create-account from the
 * account is a send, a self path-payment is a swap, a trustline change is a
 * token approval or disapproval, and an incoming credit is a receive. Anything
 * else, including a Soroban invoke, stays `unknown` — those shapes are not
 * classified from the envelope alone.
 *
 * Callers that already know the flow, such as a cross-chain swap, should pass
 * that classification instead of using this helper. A bridge send is a payment
 * in the envelope, so the operations alone would report it as a send.
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
