import { assert, StructError } from '@metamask/superstruct';

import { MAX_DROPS } from '../constants';
import {
  NonZeroValidXrplAmountStruct,
  SignedNumberStringStruct,
  UnSignedIntegerStringStruct,
  UnSignedIntegerStruct,
  UnSignedNumberStringStruct,
  ValidIouAmountStruct,
  ValidMptAmountStruct,
  ValidXrplAmountStruct,
  ValidXrplDropsStruct,
} from './amount';

describe('UnSignedNumberStringStruct', () => {
  it('accepts zero and a positive decimal', () => {
    expect(() => assert('0', UnSignedNumberStringStruct)).not.toThrow();
    expect(() => assert('1.5', UnSignedNumberStringStruct)).not.toThrow();
  });

  it('rejects an empty, negative, or non-finite value', () => {
    expect(() => assert('', UnSignedNumberStringStruct)).toThrow(StructError);
    expect(() => assert('-1', UnSignedNumberStringStruct)).toThrow(StructError);
    expect(() => assert('Infinity', UnSignedNumberStringStruct)).toThrow(
      StructError,
    );
    expect(() => assert('nope', UnSignedNumberStringStruct)).toThrow(
      StructError,
    );
  });
});

describe('SignedNumberStringStruct', () => {
  it('accepts a negative decimal', () => {
    expect(() => assert('-1.5', SignedNumberStringStruct)).not.toThrow();
  });

  it('rejects an empty or non-finite value', () => {
    expect(() => assert('', SignedNumberStringStruct)).toThrow(StructError);
    expect(() => assert('Infinity', SignedNumberStringStruct)).toThrow(
      StructError,
    );
  });
});

describe('NonZeroValidXrplAmountStruct', () => {
  it('accepts a positive amount', () => {
    expect(() =>
      assert('0.000001', NonZeroValidXrplAmountStruct),
    ).not.toThrow();
  });

  it('rejects zero', () => {
    expect(() => assert('0', NonZeroValidXrplAmountStruct)).toThrow(
      StructError,
    );
  });
});

describe('UnSignedIntegerStringStruct', () => {
  it('accepts a non-negative integer string', () => {
    expect(() => assert('10', UnSignedIntegerStringStruct)).not.toThrow();
  });

  it('rejects a fraction and a negative integer', () => {
    expect(() => assert('1.5', UnSignedIntegerStringStruct)).toThrow(
      StructError,
    );
    expect(() => assert('-1', UnSignedIntegerStringStruct)).toThrow(
      StructError,
    );
  });
});

describe('ValidXrplAmountStruct', () => {
  it('accepts up to 6 decimal places', () => {
    expect(() => assert('1.123456', ValidXrplAmountStruct)).not.toThrow();
  });

  it('rejects a 7th decimal place', () => {
    expect(() => assert('1.1234567', ValidXrplAmountStruct)).toThrow(
      StructError,
    );
  });

  it('rejects an amount whose drop value is above the maximum', () => {
    expect(() => assert('100000000000', ValidXrplAmountStruct)).not.toThrow();
    expect(() => assert('100000000001', ValidXrplAmountStruct)).toThrow(
      StructError,
    );
  });
});

describe('ValidMptAmountStruct', () => {
  it('accepts a non-negative decimal', () => {
    expect(() => assert('1.5', ValidMptAmountStruct)).not.toThrow();
  });

  it('rejects a negative amount', () => {
    expect(() => assert('-1', ValidMptAmountStruct)).toThrow(StructError);
  });
});

describe('ValidIouAmountStruct', () => {
  it('accepts a signed amount with up to 15 decimal places', () => {
    expect(() => assert('-1.5', ValidIouAmountStruct)).not.toThrow();
    expect(() =>
      assert('0.000000000000001', ValidIouAmountStruct),
    ).not.toThrow();
  });

  it('rejects a 16th decimal place', () => {
    expect(() => assert('0.0000000000000001', ValidIouAmountStruct)).toThrow(
      StructError,
    );
  });

  it('rejects an amount above the IOU maximum', () => {
    expect(() => assert('1e100', ValidIouAmountStruct)).toThrow(StructError);
  });
});

describe('ValidXrplDropsStruct', () => {
  it('accepts zero and the maximum drop count', () => {
    expect(() => assert('0', ValidXrplDropsStruct)).not.toThrow();
    expect(() => assert(MAX_DROPS, ValidXrplDropsStruct)).not.toThrow();
  });

  it('rejects a fractional drop and a value above the maximum', () => {
    expect(() => assert('1.5', ValidXrplDropsStruct)).toThrow(StructError);
    expect(() => assert(`${MAX_DROPS}0`, ValidXrplDropsStruct)).toThrow(
      StructError,
    );
  });
});

describe('UnSignedIntegerStruct', () => {
  it('accepts zero and a positive integer', () => {
    expect(() => assert(0, UnSignedIntegerStruct)).not.toThrow();
    expect(() => assert(1, UnSignedIntegerStruct)).not.toThrow();
  });

  it('rejects a negative integer and a fraction', () => {
    expect(() => assert(-1, UnSignedIntegerStruct)).toThrow(StructError);
    expect(() => assert(1.5, UnSignedIntegerStruct)).toThrow(StructError);
  });
});
