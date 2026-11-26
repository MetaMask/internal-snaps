import {
  denormalizeCurrencyCode,
  parseIouAssetCodeIssuer,
  normalizeCurrencyCode,
  toLedgerMptIssuanceId,
  normalizeMptIssuanceId,
} from './caip';

const issuanceId = '05FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3';
const paddedId =
  '000000000000000005FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3';

describe('parseIouAssetCodeIssuer', () => {
  it('splits CODE.issuer', () => {
    expect(
      parseIouAssetCodeIssuer('USD.rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'),
    ).toStrictEqual({
      assetCode: 'USD',
      assetIssuer: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
    });
  });

  it('rejects a dash-separated reference', () => {
    expect(() =>
      parseIouAssetCodeIssuer('USD-rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'),
    ).toThrow('Invalid asset reference');
  });
});

describe('normalizeCurrencyCode', () => {
  it('keeps a 3-character code, including symbols', () => {
    expect(normalizeCurrencyCode('USD')).toStrictEqual('USD');
    expect(normalizeCurrencyCode('eur')).toStrictEqual('eur');
    expect(normalizeCurrencyCode('A@1')).toStrictEqual('A@1');
  });

  it('encodes a custom identifier as a 160-bit hex string', () => {
    expect(normalizeCurrencyCode('RLUSD')).toStrictEqual(
      '524C555344000000000000000000000000000000',
    );
  });

  it('uppercases a code that is already 40 hex characters', () => {
    expect(
      normalizeCurrencyCode('524c555344000000000000000000000000000000'),
    ).toStrictEqual('524C555344000000000000000000000000000000');
  });

  it('rejects a code that is not a 3-character, custom, or 160-bit value', () => {
    expect(() => normalizeCurrencyCode('')).toThrow('Invalid IOU asset code: ');
    expect(() => normalizeCurrencyCode('R'.repeat(21))).toThrow(
      `Invalid IOU asset code: ${'R'.repeat(21)}`,
    );
    // Custom identifiers are assumed not to contain symbols.
    expect(() => normalizeCurrencyCode('RL$USD')).toThrow(
      'Invalid IOU asset code: RL$USD',
    );
  });

  it('rejects the native XRP code', () => {
    expect(() => normalizeCurrencyCode('XRP')).toThrow(
      'Invalid IOU asset code: XRP',
    );
  });
});

describe('denormalizeCurrencyCode', () => {
  it('keeps a 3-character code unchanged', () => {
    expect(denormalizeCurrencyCode('USD')).toStrictEqual('USD');
    expect(denormalizeCurrencyCode('eur')).toStrictEqual('eur');
    expect(denormalizeCurrencyCode('A@1')).toStrictEqual('A@1');
  });

  it('decodes a 160-bit hex currency to its ASCII identifier', () => {
    expect(
      denormalizeCurrencyCode('524C555344000000000000000000000000000000'),
    ).toStrictEqual('RLUSD');
    expect(
      denormalizeCurrencyCode('524c555344000000000000000000000000000000'),
    ).toStrictEqual('RLUSD');
  });

  it('rejects invalid codes, including native XRP and empty hex padding', () => {
    expect(() => denormalizeCurrencyCode('XRP')).toThrow(
      'Invalid currency code to denormalize: XRP',
    );
    expect(() => denormalizeCurrencyCode('RLUSD')).toThrow(
      'Invalid currency code to denormalize: RLUSD',
    );
    expect(() => denormalizeCurrencyCode('0'.repeat(40))).toThrow(
      `Invalid currency code to denormalize: ${'0'.repeat(40)}`,
    );
  });
});

describe('normalizeMptIssuanceId', () => {
  it('uppercases a 48-hex issuance id', () => {
    expect(normalizeMptIssuanceId(issuanceId.toLowerCase())).toStrictEqual(
      issuanceId,
    );
  });

  it('reads the reference from a CAIP-19 xls33 id', () => {
    expect(normalizeMptIssuanceId(`xrpl:0/xls33:${issuanceId}`)).toStrictEqual(
      issuanceId,
    );
  });

  it('rejects a zero-padded 64-hex id', () => {
    expect(() => normalizeMptIssuanceId(paddedId)).toThrow(
      `Invalid MPT issuance id: ${paddedId}`,
    );
  });

  it('rejects an issuance id that is not 48 hex characters', () => {
    expect(() => normalizeMptIssuanceId('05fa')).toThrow(
      'Invalid MPT issuance id: 05fa',
    );
  });
});

describe('toLedgerMptIssuanceId', () => {
  it('returns a 48-character id uppercase', () => {
    expect(toLedgerMptIssuanceId(issuanceId.toLowerCase())).toStrictEqual(
      issuanceId,
    );
  });

  it('reads the reference from a CAIP-19 xls33 id', () => {
    expect(toLedgerMptIssuanceId(`xrpl:0/xls33:${issuanceId}`)).toStrictEqual(
      issuanceId,
    );
  });

  it('rejects a zero-padded 64-hex id', () => {
    expect(() => toLedgerMptIssuanceId(paddedId)).toThrow(
      `Invalid MPT issuance id: ${paddedId}`,
    );
  });
});
