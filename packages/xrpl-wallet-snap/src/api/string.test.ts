import { assert, StructError } from '@metamask/superstruct';

import { Hash256Struct, Utf8StringStruct } from './string';

describe('Utf8StringStruct', () => {
  it('accepts a UTF-8 string', () => {
    expect(() => assert('XRP café', Utf8StringStruct)).not.toThrow();
  });

  it('rejects a non-string', () => {
    expect(() => assert(1, Utf8StringStruct)).toThrow(StructError);
  });
});

describe('Hash256Struct', () => {
  it('accepts 64 hex characters in either case', () => {
    expect(() => assert('ab'.repeat(32), Hash256Struct)).not.toThrow();
    expect(() => assert('AB'.repeat(32), Hash256Struct)).not.toThrow();
  });

  it('rejects a short or non-hex value', () => {
    expect(() => assert('ab'.repeat(31), Hash256Struct)).toThrow(StructError);
    expect(() => assert(`${'g'.repeat(64)}`, Hash256Struct)).toThrow(
      StructError,
    );
  });
});
