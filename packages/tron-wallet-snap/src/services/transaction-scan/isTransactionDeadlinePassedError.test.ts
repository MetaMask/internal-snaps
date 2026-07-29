import { isTransactionDeadlinePassedError } from './isTransactionDeadlinePassedError';
import type { TransactionScanError } from './types';

describe('isTransactionDeadlinePassedError', () => {
  it('returns false when there is no error', () => {
    expect(isTransactionDeadlinePassedError(null)).toBe(false);
  });

  it('returns true when the error type is the deadline marker', () => {
    const error: TransactionScanError = {
      type: 'TransactionDeadlinePassed',
      code: null,
      message: null,
    };

    expect(isTransactionDeadlinePassedError(error)).toBe(true);
  });

  it('returns true when the message contains the deadline marker', () => {
    const error: TransactionScanError = {
      type: null,
      code: null,
      message: 'Reverted: TransactionDeadlinePassed',
    };

    expect(isTransactionDeadlinePassedError(error)).toBe(true);
  });

  it('returns true when the error type is the TAPOS-expired marker', () => {
    const error: TransactionScanError = {
      type: 'TransactionTaposExpired',
      code: null,
      message: null,
    };

    expect(isTransactionDeadlinePassedError(error)).toBe(true);
  });

  it('returns false for an unrelated failure', () => {
    const error: TransactionScanError = {
      type: 'Revert',
      code: 'INSUFFICIENT_BALANCE',
      message: 'Reverted: insufficient balance',
    };

    expect(isTransactionDeadlinePassedError(error)).toBe(false);
  });

  it('returns false when type and message are null', () => {
    const error: TransactionScanError = {
      type: null,
      code: 'SOME_CODE',
      message: null,
    };

    expect(isTransactionDeadlinePassedError(error)).toBe(false);
  });
});
