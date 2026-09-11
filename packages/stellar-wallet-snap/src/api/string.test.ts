import { assert, StructError } from '@metamask/superstruct';

import {
  StellarMemoType,
  StellarMemoTypeStruct,
  StellarMemoValueStruct,
} from './string';

describe('StellarMemoTypeStruct', () => {
  it.each(Object.values(StellarMemoType))(
    'accepts memo type %s',
    (memoType) => {
      expect(() => assert(memoType, StellarMemoTypeStruct)).not.toThrow();
    },
  );

  it('rejects an unknown memo type', () => {
    expect(() => assert('none', StellarMemoTypeStruct)).toThrow(StructError);
  });
});

describe('StellarMemoValueStruct', () => {
  it.each(['', '   ', 'deposit-ref', '12345', `${'a'.repeat(64)}`])(
    'accepts memo value %j',
    (value) => {
      expect(() => assert(value, StellarMemoValueStruct)).not.toThrow();
    },
  );

  it('rejects memo values longer than 64 characters', () => {
    expect(() => assert('a'.repeat(65), StellarMemoValueStruct)).toThrow(
      StructError,
    );
  });
});
