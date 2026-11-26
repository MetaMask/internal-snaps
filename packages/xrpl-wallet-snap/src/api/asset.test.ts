import { assert, StructError } from '@metamask/superstruct';

import {
  AssetType,
  CurrencyCodeStruct,
  KnownCaip19AssetIdOrSlip44IdStruct,
  KnownCaip19IouAssetStruct,
  KnownCaip19MptAssetStruct,
  KnownCaip19Slip44IdMap,
  KnownCaip19Slip44IdStruct,
  MptIssuanceIdStruct,
} from './asset';
import { KnownCaip2ChainId } from './network';

const address = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const issuer = 'rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz';
const issuanceId = '05FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3';
const uppercaseCurrency = '524C555344000000000000000000000000000000';

describe('AssetType', () => {
  it('names the XRPL asset namespaces', () => {
    expect(AssetType).toStrictEqual({
      Native: 'slip44',
      Token: 'token',
      Mpt: 'xls33',
    });
  });
});

describe('KnownCaip19Slip44IdStruct', () => {
  it('accepts the mapped mainnet id', () => {
    expect(KnownCaip19Slip44IdMap[KnownCaip2ChainId.Mainnet]).toBe(
      'xrpl:0/slip44:144',
    );
    expect(() =>
      assert(
        KnownCaip19Slip44IdMap[KnownCaip2ChainId.Mainnet],
        KnownCaip19Slip44IdStruct,
      ),
    ).not.toThrow();
  });

  it('rejects a non-XRP slip44 coin type', () => {
    expect(() =>
      assert('xrpl:0/slip44:148', KnownCaip19Slip44IdStruct),
    ).toThrow(StructError);
  });
});

describe('CurrencyCodeStruct', () => {
  it('accepts a 3-character code as written and 40-hex in either case', () => {
    expect(() => assert('USD', CurrencyCodeStruct)).not.toThrow();
    expect(() => assert('eur', CurrencyCodeStruct)).not.toThrow();
    expect(() => assert('A@1', CurrencyCodeStruct)).not.toThrow();
    expect(() => assert(uppercaseCurrency, CurrencyCodeStruct)).not.toThrow();
    expect(() =>
      assert(uppercaseCurrency.toLowerCase(), CurrencyCodeStruct),
    ).not.toThrow();
  });

  it('rejects a ticker longer than 3 characters', () => {
    expect(() => assert('RLUSD', CurrencyCodeStruct)).toThrow(StructError);
  });

  it('rejects the native XRP code', () => {
    expect(() => assert('XRP', CurrencyCodeStruct)).toThrow(StructError);
  });
});

describe('KnownCaip19IouAssetStruct', () => {
  it('accepts CODE.issuer, including an issuer that contains i', () => {
    expect(() =>
      assert(`xrpl:0/token:USD.${issuer}`, KnownCaip19IouAssetStruct),
    ).not.toThrow();
    expect(() =>
      assert(`xrpl:0/token:eur.${address}`, KnownCaip19IouAssetStruct),
    ).not.toThrow();
  });

  it('rejects a dash separator, the native code, and lowercase 40-hex', () => {
    expect(() =>
      assert(`xrpl:0/token:USD-${address}`, KnownCaip19IouAssetStruct),
    ).toThrow(StructError);
    expect(() =>
      assert(`xrpl:0/token:XRP.${address}`, KnownCaip19IouAssetStruct),
    ).toThrow(StructError);
    expect(() =>
      assert(
        `xrpl:0/token:${uppercaseCurrency.toLowerCase()}.${address}`,
        KnownCaip19IouAssetStruct,
      ),
    ).toThrow(StructError);
  });
});

describe('MptIssuanceIdStruct', () => {
  it('accepts 48-hex', () => {
    expect(() => assert(issuanceId, MptIssuanceIdStruct)).not.toThrow();
  });

  it('rejects a short or lowercase id', () => {
    expect(() => assert(issuanceId.slice(1), MptIssuanceIdStruct)).toThrow(
      StructError,
    );
    expect(() => assert(issuanceId.toLowerCase(), MptIssuanceIdStruct)).toThrow(
      StructError,
    );
  });
});

describe('KnownCaip19MptAssetStruct', () => {
  it('accepts 48-hex', () => {
    expect(() =>
      assert(`xrpl:0/xls33:${issuanceId}`, KnownCaip19MptAssetStruct),
    ).not.toThrow();
  });

  it('rejects a lowercase reference', () => {
    expect(() =>
      assert(
        `xrpl:0/xls33:${issuanceId.toLowerCase()}`,
        KnownCaip19MptAssetStruct,
      ),
    ).toThrow(StructError);
  });
});

describe('KnownCaip19AssetIdOrSlip44IdStruct', () => {
  it('accepts native, IOU, and MPT ids', () => {
    expect(() =>
      assert('xrpl:0/slip44:144', KnownCaip19AssetIdOrSlip44IdStruct),
    ).not.toThrow();
    expect(() =>
      assert(`xrpl:0/token:USD.${address}`, KnownCaip19AssetIdOrSlip44IdStruct),
    ).not.toThrow();
  });

  it('rejects an unknown asset namespace', () => {
    expect(() =>
      assert('xrpl:0/erc20:USD', KnownCaip19AssetIdOrSlip44IdStruct),
    ).toThrow(StructError);
  });
});
