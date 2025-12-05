import type { TransactionScanError } from '../../../../services/transaction-scan/types';
import type { Preferences } from '../../../../types/snap';
import { i18n } from '../../../../utils/i18n';

/**
 * Maps error codes to user-friendly messages
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Add Tron-specific error codes here as needed
  InsufficientBalance: 'transactionScan.errors.insufficientBalance',
  InvalidTransaction: 'transactionScan.errors.invalidTransaction',
};

/**
 * Gets a user-friendly message from a transaction scan error.
 *
 * @param error - The error of the transaction scan.
 * @param preferences - The user preferences containing locale information.
 * @returns A user-friendly error message, or the original error code if no mapping exists.
 */
export function getErrorMessage(
  error: TransactionScanError,
  preferences: Preferences,
): string {
  const translate = i18n(preferences.locale);
  const { code, type } = error;

  // Try to find a translation key for the error code
  const translationKey =
    (code && ERROR_MESSAGES[code]) ?? 'transactionScan.errors.unknownError';

  try {
    return translate(translationKey as any);
  } catch {
    // If translation fails, return a descriptive message based on the error
    return type ?? code ?? 'Unknown error';
  }
}
