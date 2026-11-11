import { TRANSACTION_TAPOS_EXPIRED } from '../../../services/transaction-scan/isTransactionDeadlinePassedError';
import { FetchStatus } from '../../../types/snap';
import type { ConfirmSignTransactionContext } from '../views/ConfirmSignTransaction/types';
import type { ConfirmTransactionRequestContext } from '../views/ConfirmTransactionRequest/types';

export type TransactionConfirmationContext =
  | ConfirmSignTransactionContext
  | ConfirmTransactionRequestContext;

/**
 * Identifies the signing confirmation context by its transaction field.
 *
 * @param context - The transaction confirmation context.
 * @returns Whether this is a signing confirmation.
 */
export function isSignTransactionContext(
  context: TransactionConfirmationContext,
): context is ConfirmSignTransactionContext {
  return Object.hasOwn(context, 'transaction');
}

/**
 * Applies the existing confirmation blockers in both the view and user events.
 * Remote simulation failures and background refreshes do not block confirmation.
 * The local balance check belongs only to the signing flow.
 *
 * @param context - The current transaction confirmation context.
 * @returns Whether confirmation is blocked.
 */
export function isTransactionConfirmationBlocked(
  context: TransactionConfirmationContext,
): boolean {
  return (
    context.scanFetchStatus === FetchStatus.Loading ||
    context.scan?.error?.type === TRANSACTION_TAPOS_EXPIRED ||
    context.scan?.error?.type === 'MALFORMED_TRANSACTION' ||
    // The local balance check is only relevant to dapp signing flow.
    (isSignTransactionContext(context) && context.isInsufficientBalance)
  );
}
