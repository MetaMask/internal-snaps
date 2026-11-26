import { assert, StructError } from '@metamask/superstruct';
import { encode } from 'xrpl';

import {
  ValidDestinationTagStruct,
  XrplTransactionHashStruct,
  XrplTransactionStringStruct,
} from './transaction';

const address = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

describe('ValidDestinationTagStruct', () => {
  it('accepts UInt32 numbers including 0 and max', () => {
    expect(ValidDestinationTagStruct.create(0)).toBe(0);
    expect(ValidDestinationTagStruct.create(1234)).toBe(1234);
    expect(ValidDestinationTagStruct.create(4_294_967_295)).toBe(4_294_967_295);
  });

  it('coerces decimal digit strings to numbers', () => {
    expect(ValidDestinationTagStruct.create('42')).toBe(42);
    expect(ValidDestinationTagStruct.create(' 7 ')).toBe(7);
    expect(ValidDestinationTagStruct.create('0')).toBe(0);
  });

  it('rejects negatives, fractions, non-digits, and values above UInt32', () => {
    expect(() => ValidDestinationTagStruct.create(-1)).toThrow(StructError);
    expect(() => ValidDestinationTagStruct.create(1.5)).toThrow(StructError);
    expect(() => ValidDestinationTagStruct.create(4_294_967_296)).toThrow(
      StructError,
    );
    expect(() => ValidDestinationTagStruct.create('not-a-tag')).toThrow(
      StructError,
    );
    expect(() => ValidDestinationTagStruct.create('4294967296')).toThrow(
      StructError,
    );
    expect(() => ValidDestinationTagStruct.create('')).toThrow(StructError);
    expect(() => ValidDestinationTagStruct.create('   ')).toThrow(StructError);
  });
});

describe('XrplTransactionHashStruct', () => {
  it('accepts a 64-hex hash in either case', () => {
    expect(() =>
      assert('e'.repeat(64), XrplTransactionHashStruct),
    ).not.toThrow();
    expect(() =>
      assert('E'.repeat(64), XrplTransactionHashStruct),
    ).not.toThrow();
  });

  it('rejects a short hash and a 0x prefix', () => {
    expect(() => assert('e'.repeat(63), XrplTransactionHashStruct)).toThrow(
      StructError,
    );
    expect(() =>
      assert(`0x${'e'.repeat(64)}`, XrplTransactionHashStruct),
    ).toThrow(StructError);
  });
});

describe('XrplTransactionStringStruct', () => {
  it('accepts an encoded payment', () => {
    const blob = encode({
      TransactionType: 'Payment',
      Account: address,
      Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      Amount: '1000000',
      Fee: '12',
      Sequence: 1,
    });

    expect(() => assert(blob, XrplTransactionStringStruct)).not.toThrow();
  });

  it('rejects hex that is not a transaction', () => {
    expect(() => assert('00', XrplTransactionStringStruct)).toThrow(
      StructError,
    );
  });
});
