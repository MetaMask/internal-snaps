import { getErrorMessage } from './getErrorMessage';
import type { TransactionScanError } from '../../../../services/transaction-scan/types';
import type { Preferences } from '../../../../types/snap';

describe('getErrorMessage', () => {
  const mockPreferences: Preferences = {
    locale: 'en',
    currency: 'usd',
    hideBalances: false,
    useSecurityAlerts: true,
    useExternalPricingData: true,
    simulateOnChainActions: true,
    useTokenDetection: true,
    batchCheckBalances: true,
    displayNftMedia: true,
    useNftDetection: true,
  };

  it('returns translated message for known error codes', () => {
    const error: TransactionScanError = {
      type: 'validation_error',
      code: 'InsufficientBalance',
    };

    const result = getErrorMessage(error, mockPreferences);

    expect(result).toBe('Insufficient balance');
  });

  it('returns translated message for invalid transaction code', () => {
    const error: TransactionScanError = {
      type: 'validation_error',
      code: 'InvalidTransaction',
    };

    const result = getErrorMessage(error, mockPreferences);

    expect(result).toBe('Invalid transaction');
  });

  it('returns unknown error message for unmapped code', () => {
    const error: TransactionScanError = {
      type: 'validation_error',
      code: 'SomeUnknownCode',
    };

    const result = getErrorMessage(error, mockPreferences);

    expect(result).toBe('An unknown error occurred');
  });

  it('returns unknown error message when code is null', () => {
    const error: TransactionScanError = {
      type: 'validation_error',
      code: null,
    };

    const result = getErrorMessage(error, mockPreferences);

    expect(result).toBe('An unknown error occurred');
  });

  it('returns unknown error message for unmapped errors', () => {
    const error: TransactionScanError = {
      type: 'some_error_type',
      code: null,
    };

    const result = getErrorMessage(error, mockPreferences);

    // Unknown errors return the unknownError translation
    expect(result).toBe('An unknown error occurred');
  });

  it('returns unknown error message when type and code are null', () => {
    const error: TransactionScanError = {
      type: null,
      code: null,
    };

    const result = getErrorMessage(error, mockPreferences);

    expect(result).toBe('An unknown error occurred');
  });
});
