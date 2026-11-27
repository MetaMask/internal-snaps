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

export function isLedgerEntryNotFoundError(error: unknown): boolean {
  return (
    error instanceof RpcResponseException &&
    error.errorCode === KnownRpcError.entryNotFound
  );
}

/**
 * Sequence mismatches. Do not submit again.
 *
 * Reliable submission says to stop and find out why the sequence does not
 * match, instead of signing a new sequence automatically.
 *
 * @see https://xrpl.org/docs/concepts/transactions/reliable-transaction-submission
 */
const RETRYABLE_SEQUENCE_RESULTS = new Set(['tefPAST_SEQ', 'terPRE_SEQ']);

/**
 * Whether submit provisionally applied the transaction successfully.
 *
 * Only `tesSUCCESS` means the transaction achieved its intended purpose.
 * `tec*` codes are failures (fee may still be claimed if included without
 * `fail_hard`); `terQUEUED` and other non-`tes` codes are not successes.
 *
 * @see https://xrpl.org/docs/concepts/transactions/transaction-results
 *
 * @param engineResult - `engine_result` from `submit`.
 * @returns True only for `tesSUCCESS`.
 */
export function isAcceptedSubmitResult(engineResult: string): boolean {
  return engineResult === 'tesSUCCESS';
}

/**
 * Whether the signed sequence does not match the account sequence.
 *
 * A true result is not a signal to retry. Stop and determine why `Sequence`
 * does not match the account.
 *
 * @see https://xrpl.org/docs/concepts/transactions/reliable-transaction-submission
 *
 * @param engineResult - `engine_result` from `submit`.
 * @returns True for `tefPAST_SEQ` and `terPRE_SEQ`.
 */
export function isRetryableSequenceResult(engineResult: string): boolean {
  return RETRYABLE_SEQUENCE_RESULTS.has(engineResult);
}
