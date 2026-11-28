import { KnownRpcError } from './api';
import { RpcResponseException } from './exceptions';

/**
 * Detects the error shape thrown by RPC `account_info` when the account is not found.
 *
 * @param error - Value caught from the RPC client.
 * @returns True when the error is an account not found error.
 */
export function isAccountNotFoundError(error: unknown): boolean {
  return (
    error instanceof RpcResponseException &&
    error.errorCode === KnownRpcError.AccountNotFound
  );
}

/**
 * Detects the error shape thrown when the destination account is not found
 * (e.g. `deposit_authorized` → `dstActNotFound`).
 *
 * @param error - Value caught from the RPC client.
 * @returns True when the error is a destination account not found error.
 */
export function isDestAccountNotFoundError(error: unknown): boolean {
  return (
    error instanceof RpcResponseException &&
    error.errorCode === KnownRpcError.DestinationAccountNotFound
  );
}

/**
 * Detects the error shape thrown by RPC `tx` when the transaction is not found.
 *
 * @param error - Value caught from the RPC client.
 * @returns True when the error is a transaction not found error.
 */
export function isTransactionNotFoundError(error: unknown): boolean {
  return (
    error instanceof RpcResponseException &&
    error.errorCode === KnownRpcError.TransactionNotFound
  );
}

/**
 * Whether submit provisionally applied the transaction successfully.
 *
 * Only `tesSUCCESS` means the transaction achieved its intended purpose.
 * Other codes are consider failures as we do not allow partial submissions.
 * Reliable submission says to stop and find out why the sequence does not
 * match, instead of signing a new sequence automatically.
 *
 * @see https://xrpl.org/docs/concepts/transactions/reliable-transaction-submission
 *
 * @param engineResult - `engine_result` from `submit`.
 * @returns True only for `tesSUCCESS`.
 */
export function isAcceptedSubmitResult(engineResult: string): boolean {
  return engineResult === 'tesSUCCESS';
}
