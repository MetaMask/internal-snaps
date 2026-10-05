import { Memo } from '@stellar/stellar-sdk';

import { InvalidMemoException } from './exceptions';
import { isMemoId, isMemoText, resolveStellarMemo } from './memo';

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

describe('resolveStellarMemo', () => {
  it('returns null for empty, whitespace-only, or non-string values', () => {
    expect(resolveStellarMemo(undefined)).toBeNull();
    expect(resolveStellarMemo(null)).toBeNull();
    expect(resolveStellarMemo('')).toBeNull();
    expect(resolveStellarMemo('   ')).toBeNull();
    expect(resolveStellarMemo(true)).toBeNull();
    expect(resolveStellarMemo({ memo: 'x' })).toBeNull();
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

  it('throws InvalidMemoException when text memo exceeds 28 UTF-8 bytes', () => {
    expect(() => resolveStellarMemo('é'.repeat(15))).toThrow(
      InvalidMemoException,
    );
  });

  it('throws InvalidMemoException when the Stellar SDK rejects the memo', () => {
    const idSpy = jest.spyOn(Memo, 'id').mockImplementation(() => {
      throw new Error('sdk');
    });

    expect(() => resolveStellarMemo('123')).toThrow(InvalidMemoException);
    idSpy.mockRestore();
  });
});
