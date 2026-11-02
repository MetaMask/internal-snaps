import { assert, StructError } from '@metamask/superstruct';
import {
  Account,
  MuxedAccount,
  encodeMuxedContractAddress,
} from '@stellar/stellar-sdk';

import {
  StellarAddressOrContractStruct,
  StellarAddressStruct,
  StellarSecretKeyStruct,
} from './address';

const accountAddress =
  'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO';
const contractId = 'CASUP2OPFVEHCWGP2XLBXOV7DQIQIT42AQISG4MXAZGNLVFFN63X7WRT';
const muxedContractAddress = encodeMuxedContractAddress(contractId, '123');
const muxedAccountAddress = new MuxedAccount(
  new Account(accountAddress, '0'),
  '1',
).accountId();

describe('StellarAddressStruct', () => {
  it('accepts a valid Stellar address', () => {
    expect(() =>
      assert(
        'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO',
        StellarAddressStruct,
      ),
    ).not.toThrow();
  });

  it.each(['invalid-address', muxedContractAddress, muxedAccountAddress])(
    'rejects a non-G Stellar address: "%s"',
    (address) => {
      expect(() => assert(address, StellarAddressStruct)).toThrow(StructError);
    },
  );
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
      assert(contractId, StellarAddressOrContractStruct),
    ).not.toThrow();
  });

  it('accepts a CAP-84 muxed contract address', () => {
    expect(() =>
      assert(muxedContractAddress, StellarAddressOrContractStruct),
    ).not.toThrow();
  });

  it.each([
    'invalid-address',
    // Muxed accounts (M…) remain unsupported for this struct.
    muxedAccountAddress,
  ])('rejects an invalid Stellar address or contract: "%s"', (value) => {
    expect(() => assert(value, StellarAddressOrContractStruct)).toThrow(
      StructError,
    );
  });
});
