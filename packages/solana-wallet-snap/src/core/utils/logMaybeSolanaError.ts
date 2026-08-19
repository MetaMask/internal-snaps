import type { LogMethod } from '@metamask/snap-networks-utils';
import { getSystemErrorMessage, isSystemError } from '@solana-program/system';
import type { Address } from '@solana/kit';
import { isSolanaError } from '@solana/kit';

type TransactionMessageIsh = {
  instructions: Record<
    number,
    {
      programAddress: Address;
    }
  >;
};

/**
 * Generic logging function for Solana errors.
 *
 * @param error - The Solana error to log.
 * @param log - The logger output function for formatted error details.
 * @param transactionMessage - The transaction message to include in the error detail message.
 */
export const logMaybeSolanaError = (
  error: unknown,
  log: LogMethod,
  transactionMessage: TransactionMessageIsh = { instructions: {} },
): void => {
  if (isSolanaError(error)) {
    const preflightErrorContext = error.context;
    const preflightErrorMessage = error.message;
    const errorDetailMessage = isSystemError(error.cause, transactionMessage)
      ? getSystemErrorMessage(error.cause.context.code)
      : error.cause;
    log(
      preflightErrorContext,
      '%s: %s',
      preflightErrorMessage,
      errorDetailMessage,
    );
  }
};
