import { buildUrl } from '@metamask/snap-networks-utils';

import {
  HttpException,
  HttpResponseException,
  InvalidHttpResponseException,
} from '../../../utils/errors';
import { PriceApiClient } from './PriceApiClient';

jest.mock('../../../utils/logger');

const jsonResponse = (
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): Response => {
  const { ok = true, status = ok ? 200 : 500 } = init;
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
};

const baseUrl = 'https://price.test';

/** Known-valid Stellar CAIP asset ids (see `api/asset.test.ts`). */
const stellarClassicUsdc =
  'stellar:testnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as const;

const stellarSep41 =
  'stellar:pubnet/sep41:CAUP7NFABXE5TJRL3FKTPMWRLC7IAXYDCTHQRFSCLR5TMGKHOOQO772J' as const;

const minimalSpotPrice = (id: string, price: number) => ({
  id,
  price,
});

describe('PriceApiClient', () => {
  const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createClient = () => new PriceApiClient({ baseUrl }, mockFetch);

  describe('getSpotPrices', () => {
    it('requests spot prices with default vsCurrency', async () => {
      const spotBody = {
        [stellarClassicUsdc]: minimalSpotPrice('usdc', 1),
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(spotBody));

      const client = createClient();
      expect(await client.getSpotPrices([stellarClassicUsdc])).toStrictEqual(
        spotBody,
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0]?.[0]).toBe(
        buildUrl({
          baseUrl,
          path: '/v3/spot-prices',
          queryParams: {
            vsCurrency: 'usd',
            assetIds: stellarClassicUsdc,
          },
        }),
      );
    });

    it('passes custom vsCurrency in query params', async () => {
      const spotBody = {
        [stellarClassicUsdc]: minimalSpotPrice('usdc', 1),
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(spotBody));

      const client = createClient();
      await client.getSpotPrices([stellarClassicUsdc], 'eur');

      expect(mockFetch.mock.calls[0]?.[0]).toBe(
        buildUrl({
          baseUrl,
          path: '/v3/spot-prices',
          queryParams: {
            vsCurrency: 'eur',
            assetIds: stellarClassicUsdc,
          },
        }),
      );
    });

    it('passes all assetIds in a single request', async () => {
      const spotBody = {
        [stellarClassicUsdc]: minimalSpotPrice('usdc', 1),
        [stellarSep41]: minimalSpotPrice('sep41', 0.12),
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(spotBody));

      const client = createClient();
      expect(
        await client.getSpotPrices([stellarClassicUsdc, stellarSep41]),
      ).toStrictEqual(spotBody);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0]?.[0]).toBe(
        buildUrl({
          baseUrl,
          path: '/v3/spot-prices',
          queryParams: {
            vsCurrency: 'usd',
            assetIds: `${stellarClassicUsdc},${stellarSep41}`,
          },
        }),
      );
    });

    it('preserves duplicate assetIds in the request', async () => {
      const spotBody = {
        [stellarClassicUsdc]: minimalSpotPrice('usdc', 1),
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(spotBody));

      const client = createClient();
      await client.getSpotPrices([stellarClassicUsdc, stellarClassicUsdc]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const urlArg = mockFetch.mock.calls[0]?.[0] as string;
      expect(new URL(urlArg).searchParams.get('assetIds')).toBe(
        `${stellarClassicUsdc},${stellarClassicUsdc}`,
      );
    });

    it('throws HttpResponseException when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({}, { ok: false, status: 503 }),
      );

      const client = createClient();
      await expect(client.getSpotPrices([stellarClassicUsdc])).rejects.toThrow(
        HttpResponseException,
      );
    });

    it('rejects with InvalidHttpResponseException when response body fails validation', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ notValid: true }));

      const client = createClient();
      await expect(
        client.getSpotPrices([stellarClassicUsdc]),
      ).rejects.toBeInstanceOf(InvalidHttpResponseException);
    });

    it('throws HttpException when fetch rejects with HTTP error', async () => {
      const networkError = Object.assign(new Error('network down'), {
        cause: { code: 'ECONNREFUSED' },
      });
      mockFetch.mockRejectedValueOnce(networkError);

      const client = createClient();
      await expect(client.getSpotPrices([stellarClassicUsdc])).rejects.toThrow(
        HttpException,
      );
    });
  });
});
