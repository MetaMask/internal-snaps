import { assert, StructError } from '@metamask/superstruct';
import { cloneDeep, set } from 'lodash';

import {
  GetSpotPricesParamsStruct,
  GetSpotPricesResponseStruct,
  SpotPriceStruct,
} from './api';
import type { SpotPricesResponse } from './api';

const stellarClassicUsdc =
  'stellar:testnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as const;

const validSpotPrices: SpotPricesResponse = {
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
    id: 'solana',
    price: 150,
  },
  'eip155:1/slip44:60': {
    id: 'ethereum',
    price: 2000,
  },
  [stellarClassicUsdc]: null,
};

describe('price-api structs', () => {
  describe('SpotPriceStruct', () => {
    it('accepts minimal spot price fields', () => {
      expect(() =>
        assert({ id: 'xlm', price: 0.12 }, SpotPriceStruct),
      ).not.toThrow();
    });

    it('rejects negative price', () => {
      expect(() =>
        assert({ id: 'xlm', price: -0.01 }, SpotPriceStruct),
      ).toThrow(StructError);
    });

    it('accepts negative dilutedMarketCap', () => {
      expect(() =>
        assert(
          { id: 'xlm', price: 0.12, dilutedMarketCap: -1 },
          SpotPriceStruct,
        ),
      ).not.toThrow();
    });
  });

  describe('GetSpotPricesResponseStruct', () => {
    it('accepts valid spot prices map including null entry', () => {
      expect(() =>
        assert(validSpotPrices, GetSpotPricesResponseStruct),
      ).not.toThrow();
    });

    it('rejects negative price on an asset', () => {
      const spotPricesWithInvalidPrice = cloneDeep(validSpotPrices);
      set(
        spotPricesWithInvalidPrice,
        ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501', 'price'],
        -4,
      );

      expect(() =>
        assert(spotPricesWithInvalidPrice, GetSpotPricesResponseStruct),
      ).toThrow(StructError);
    });

    it('rejects invalid CAIP asset key', () => {
      expect(() =>
        assert(
          {
            'invalid-asset-key': { id: 'x', price: 1 },
          },
          GetSpotPricesResponseStruct,
        ),
      ).toThrow(StructError);
    });
  });

  describe('GetSpotPricesParamsStruct', () => {
    it('accepts assetIds and vsCurrency', () => {
      expect(() =>
        assert(
          {
            assetIds: [stellarClassicUsdc],
            vsCurrency: 'usd',
          },
          GetSpotPricesParamsStruct,
        ),
      ).not.toThrow();
    });

    it('rejects invalid vsCurrency', () => {
      expect(() =>
        assert(
          {
            assetIds: [stellarClassicUsdc],
            vsCurrency: 'not-a-ticker',
          },
          GetSpotPricesParamsStruct,
        ),
      ).toThrow(StructError);
    });
  });
});
