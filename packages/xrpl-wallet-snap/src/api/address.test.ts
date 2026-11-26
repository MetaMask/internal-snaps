import { assert, StructError } from '@metamask/superstruct';

import { XrplAddressStruct, XrplSecretKeyStruct } from './address';

const address = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const privateKey =
  '0090802A50AA84EFB6CDB225F17C27616EA94048C179142FECF03F4712A07EA7A4';

describe('XrplAddressStruct', () => {
  it('accepts a classic address', () => {
    expect(() => assert(address, XrplAddressStruct)).not.toThrow();
  });

  it('rejects an empty address', () => {
    expect(() => assert('', XrplAddressStruct)).toThrow(StructError);
  });

  it('rejects an address with a bad checksum', () => {
    expect(() => assert(`${address.slice(0, -1)}i`, XrplAddressStruct)).toThrow(
      StructError,
    );
  });

  it('rejects an X-address', () => {
    expect(() =>
      assert(
        'XVPcpSm47b1CZkf5AkKM9a84dQHe3m4sBhsrA4XtnBECTAc',
        XrplAddressStruct,
      ),
    ).toThrow(StructError);
  });
});

describe('XrplSecretKeyStruct', () => {
  it('accepts a 00-prefixed secp256k1 key', () => {
    expect(() => assert(privateKey, XrplSecretKeyStruct)).not.toThrow();
    expect(() =>
      assert(`0x${privateKey.toLowerCase()}`, XrplSecretKeyStruct),
    ).not.toThrow();
  });

  it('rejects a key that is missing the 00 prefix', () => {
    expect(() => assert(privateKey.slice(2), XrplSecretKeyStruct)).toThrow(
      StructError,
    );
  });

  it('rejects a family seed', () => {
    expect(() =>
      assert('sEdTM1uX8pu2do5XvTnutH6HsouMaM2', XrplSecretKeyStruct),
    ).toThrow(StructError);
  });
});
