import { assert, StructError } from '@metamask/superstruct';
import { Memo } from '@stellar/stellar-sdk';

import {
  resolveStellarMemo,
  StellarMemoIdStruct,
  StellarTextMemoStruct,
} from './memo';

describe('StellarMemoIdStruct', () => {
  it.each(['0', '12345', '18446744073709551615'])(
    'accepts memo id %s',
    (value) => {
      expect(() => assert(value, StellarMemoIdStruct)).not.toThrow();
    },
  );

  it.each(['', '12abc', 'deposit-ref', '18446744073709551616', '-1'])(
    'rejects memo id %j',
    (value) => {
      expect(() => assert(value, StellarMemoIdStruct)).toThrow(StructError);
    },
  );
});

describe('StellarTextMemoStruct', () => {
  it('accepts text within 28 UTF-8 bytes', () => {
    expect(() => assert('deposit-ref', StellarTextMemoStruct)).not.toThrow();
    expect(() => assert('é'.repeat(14), StellarTextMemoStruct)).not.toThrow();
  });

  it('rejects text over 28 UTF-8 bytes', () => {
    expect(() => assert('é'.repeat(15), StellarTextMemoStruct)).toThrow(
      StructError,
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
    expect(() => resolveStellarMemo('é'.repeat(15))).toThrow(StructError);
  });
});
