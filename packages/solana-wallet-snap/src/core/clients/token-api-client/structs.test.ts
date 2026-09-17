import { assert, StructError } from '@metamask/superstruct';

import { TokenMetadataResponseStruct, TokenMetadataStruct } from './structs';

const MOCK_TOKEN_METADATA = {
  decimals: 9,
  assetId:
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:1GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
  name: 'Popcat 1',
  symbol: 'POPCAT',
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
      ).toThrow(StructError);
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
