import { Memo } from '@stellar/stellar-sdk';

import {
  getMemoDraftValidationError,
  isMemoId,
  isMemoText,
  resolveStellarMemo,
} from './memo';

describe('isMemoId', () => {
  it.each(['0', '12345', '18446744073709551615'])(
    'accepts memo id %s',
    (value) => {
      expect(isMemoId(value)).toBe(true);
    },
  );

  it.each(['', '12abc', 'deposit-ref', '18446744073709551616', '-1'])(
    'rejects memo id %j',
    (value) => {
      expect(isMemoId(value)).toBe(false);
    },
  );
});

describe('isMemoText', () => {
  it('accepts text within 28 UTF-8 bytes', () => {
    expect(isMemoText('deposit-ref')).toBe(true);
    expect(isMemoText('é'.repeat(14))).toBe(true);
  });

  it('rejects text over 28 UTF-8 bytes', () => {
    expect(isMemoText('é'.repeat(15))).toBe(false);
  });
});

describe('getMemoDraftValidationError', () => {
  it('returns null for empty or whitespace-only values', () => {
    expect(getMemoDraftValidationError('')).toBeNull();
    expect(getMemoDraftValidationError('   ')).toBeNull();
  });

  it('returns null for valid memo id and text values', () => {
    expect(getMemoDraftValidationError('9876543210')).toBeNull();
    expect(getMemoDraftValidationError('deposit-ref')).toBeNull();
    expect(getMemoDraftValidationError('18446744073709551616')).toBeNull();
  });

  it('returns tooLong when the value exceeds 28 UTF-8 bytes', () => {
    expect(getMemoDraftValidationError('é'.repeat(15))).toBe(
      'confirmation.memo.error.tooLong',
    );
  });
});

describe('resolveStellarMemo', () => {
  it('returns null for empty or whitespace-only values', () => {
    expect(resolveStellarMemo(undefined)).toBeNull();
    expect(resolveStellarMemo(null)).toBeNull();
    expect(resolveStellarMemo('')).toBeNull();
    expect(resolveStellarMemo('   ')).toBeNull();
  });

  it('builds a text memo for non-numeric values', () => {
    expect(resolveStellarMemo('  deposit-ref  ')).toStrictEqual(
      Memo.text('deposit-ref'),
    );
  });

  it('infers memo id for all-digit uint64 values', () => {
    expect(resolveStellarMemo('9876543210')).toStrictEqual(
      Memo.id('9876543210'),
    );
  });

  it('falls back to text when digits exceed uint64', () => {
    expect(resolveStellarMemo('18446744073709551616')).toStrictEqual(
      Memo.text('18446744073709551616'),
    );
  });

  it('throws when text memo exceeds 28 UTF-8 bytes', () => {
    expect(() => resolveStellarMemo('é'.repeat(15))).toThrow(
      'Memo must be 28 bytes or fewer',
    );
  });
});
