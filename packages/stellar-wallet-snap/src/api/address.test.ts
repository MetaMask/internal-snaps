import { assert, StructError } from '@metamask/superstruct';

import {
  StellarAddressOrContractStruct,
  StellarAddressStruct,
  StellarSecretKeyStruct,
} from './address';

describe('StellarAddressStruct', () => {
  it('accepts a valid Stellar address', () => {
    expect(() =>
      assert(
        'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
        StellarAddressStruct,
      ),
    ).not.toThrow();
  });

  it('rejects an invalid Stellar address', () => {
    const address = 'invalid-address';
    expect(() => assert(address, StellarAddressStruct)).toThrow(StructError);
  });
});

describe('StellarSecretKeyStruct', () => {
  it('accepts a valid Stellar secret seed', () => {
    expect(() =>
      assert(
        'SAKICEVQLYWGSOJS4WW7HZJWAHZVEEBS527LHK5V4MLJALYKICQCJXMW',
        StellarSecretKeyStruct,
      ),
    ).not.toThrow();
  });

  it.each([
    'invalid-secret',
    'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
    '',
  ])('rejects an invalid Stellar secret seed: "%s"', (secret) => {
    expect(() => assert(secret, StellarSecretKeyStruct)).toThrow(StructError);
  });
});

describe('StellarAddressOrContractStruct', () => {
  it('accepts a valid Stellar address', () => {
    expect(() =>
      assert(
        'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
        StellarAddressOrContractStruct,
      ),
    ).not.toThrow();
  });

  it('accepts a valid Stellar contract', () => {
    expect(() =>
      assert(
        'CASUP2OPFVEHCWGP2XLBXOV7DQIQIT42AQISG4MXAZGNLVFFN63X7WRT',
        StellarAddressOrContractStruct,
      ),
    ).not.toThrow();
  });

  it('rejects an invalid Stellar address or contract', () => {
    expect(() =>
      assert('invalid-address', StellarAddressOrContractStruct),
    ).toThrow(StructError);
  });
});
