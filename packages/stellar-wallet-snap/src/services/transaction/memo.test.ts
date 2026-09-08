import { Memo } from '@stellar/stellar-sdk';

import {
  inferStellarMemoType,
  resolveStellarMemo,
  StellarMemoType,
} from './memo';

describe('inferStellarMemoType', () => {
  it.each([
    { value: '12345', expected: StellarMemoType.Id },
    { value: '0', expected: StellarMemoType.Id },
    { value: '18446744073709551615', expected: StellarMemoType.Id },
    { value: 'deposit-ref', expected: StellarMemoType.Text },
    { value: '12abc', expected: StellarMemoType.Text },
    { value: '18446744073709551616', expected: StellarMemoType.Text },
  ])('infers $expected for $value', ({ value, expected }) => {
    expect(inferStellarMemoType(value)).toBe(expected);
  });
});

describe('resolveStellarMemo', () => {
  it('returns null for empty or whitespace-only values', () => {
    expect(resolveStellarMemo({ value: undefined })).toBeNull();
    expect(resolveStellarMemo({ value: '' })).toBeNull();
    expect(resolveStellarMemo({ value: '   ' })).toBeNull();
  });

  it('builds a text memo by default for non-numeric values', () => {
    const memo = resolveStellarMemo({ value: '  deposit-ref  ' });
    expect(memo).toStrictEqual(Memo.text('deposit-ref'));
  });

  it('infers memo id for all-digit values when type is omitted', () => {
    const memo = resolveStellarMemo({ value: '9876543210' });
    expect(memo).toStrictEqual(Memo.id('9876543210'));
  });

  it('honors an explicit text type for numeric values', () => {
    const memo = resolveStellarMemo({
      value: '12345',
      type: StellarMemoType.Text,
    });
    expect(memo).toStrictEqual(Memo.text('12345'));
  });

  it('honors an explicit id type', () => {
    const memo = resolveStellarMemo({
      value: '42',
      type: StellarMemoType.Id,
    });
    expect(memo).toStrictEqual(Memo.id('42'));
  });

  it('builds hash and return memos from 64-char hex', () => {
    const hex = 'a'.repeat(64);
    expect(
      resolveStellarMemo({ value: hex, type: StellarMemoType.Hash }),
    ).toStrictEqual(Memo.hash(hex));
    expect(
      resolveStellarMemo({ value: hex, type: StellarMemoType.Return }),
    ).toStrictEqual(Memo.return(hex));
  });

  it('throws when text memo exceeds 28 UTF-8 bytes', () => {
    expect(() => resolveStellarMemo({ value: 'é'.repeat(15) })).toThrow(
      'Memo must be 28 bytes or fewer',
    );
  });

  it('throws when hash hex is invalid', () => {
    expect(() =>
      resolveStellarMemo({ value: 'abc', type: StellarMemoType.Hash }),
    ).toThrow('Memo hash must be a 64-character hex string');
  });

  it('throws when explicit id is not decimal', () => {
    expect(() =>
      resolveStellarMemo({ value: 'not-an-id', type: StellarMemoType.Id }),
    ).toThrow('Memo id must be a non-negative decimal integer');
  });
});
