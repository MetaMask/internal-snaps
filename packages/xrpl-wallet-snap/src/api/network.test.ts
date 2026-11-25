import { assert, StructError } from '@metamask/superstruct';

import { KnownCaip2ChainId, KnownCaip2ChainIdStruct } from './network';

describe('KnownCaip2ChainId', () => {
  it('identifies mainnet as xrpl:0', () => {
    expect(KnownCaip2ChainId.Mainnet).toBe('xrpl:0');
  });
});

describe('KnownCaip2ChainIdStruct', () => {
  it('accepts mainnet', () => {
    expect(() =>
      assert(KnownCaip2ChainId.Mainnet, KnownCaip2ChainIdStruct),
    ).not.toThrow();
  });

  it('rejects a testnet scope', () => {
    expect(() => assert('xrpl:1', KnownCaip2ChainIdStruct)).toThrow(
      StructError,
    );
  });
});
