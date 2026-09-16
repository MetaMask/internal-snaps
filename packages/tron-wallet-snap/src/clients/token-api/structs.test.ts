import { assert, StructError } from '@metamask/superstruct';

import { TokenMetadataResponseStruct, TokenMetadataStruct } from './structs';

const MOCK_TOKEN_METADATA = {
  decimals: 6,
  assetId: 'tron:728126428/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  name: 'Tether USD',
  symbol: 'USDT',
};

describe('structs', () => {
  describe('TokenMetadataStruct', () => {
    it('accepts valid token metadata', () => {
      expect(() =>
        assert(MOCK_TOKEN_METADATA, TokenMetadataStruct),
      ).not.toThrow();
    });

    it('accepts unknown fields from the Token API without throwing', () => {
      const tokenMetadataWithUnknownField = {
        ...MOCK_TOKEN_METADATA,
        newUnknownField: false,
      };

      expect(() =>
        assert(tokenMetadataWithUnknownField, TokenMetadataStruct),
      ).not.toThrow();
    });

    it('rejects invalid decimals', () => {
      expect(() =>
        assert(
          { ...MOCK_TOKEN_METADATA, decimals: 'not-a-number' },
          TokenMetadataStruct,
        ),
      ).toThrow(StructError);
    });

    it('rejects an invalid assetId', () => {
      expect(() =>
        assert(
          { ...MOCK_TOKEN_METADATA, assetId: 'bad-asset-id' },
          TokenMetadataStruct,
        ),
      ).toThrow(
        'At path: assetId -- Expected a value of type `CaipAssetType`, but received: `"bad-asset-id"`',
      );
    });
  });

  describe('TokenMetadataResponseStruct', () => {
    it('accepts a response containing unknown fields without throwing', () => {
      const responseWithUnknownField = [
        {
          ...MOCK_TOKEN_METADATA,
          newUnknownField: false,
        },
      ];

      expect(() =>
        assert(responseWithUnknownField, TokenMetadataResponseStruct),
      ).not.toThrow();
    });
  });
});
