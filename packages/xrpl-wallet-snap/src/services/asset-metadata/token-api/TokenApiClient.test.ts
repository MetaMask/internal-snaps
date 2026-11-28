import * as snapNetworksUtils from '@metamask/snap-networks-utils';
import { buildUrl } from '@metamask/snap-networks-utils';
import type { MockedFunction } from 'vitest';

import { KnownCaip2ChainId } from '../../../api';
import { IOU_DECIMAL_PLACES } from '../../../constants';
import {
  HttpException,
  HttpResponseException,
  InvalidHttpResponseException,
} from '../../../utils/errors';
import { USDC_IOU, USDC_MPT, USDT_MPT } from '../__mocks__/assets.fixtures';
import { TokenApiClient } from './TokenApiClient';

const baseUrl = 'https://tokens.test';

const jsonResponse = (
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): Response => {
  const { ok = true, status = ok ? 200 : 500 } = init;
  return {
    ok,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
};

const tokenMetadataResponse = (
  assetId: string,
  overrides: Record<string, unknown> = {},
): { assetId: string; decimals: number; [key: string]: unknown } => ({
  assetId,
  decimals: IOU_DECIMAL_PLACES,
  ...overrides,
});

describe('TokenApiClient', () => {
  const mockFetch = vi.fn() as MockedFunction<typeof fetch>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createClient = (): TokenApiClient =>
    new TokenApiClient({ baseUrl }, mockFetch);

  it('creates a fetch policy for the token API', () => {
    const createFetchPolicySpy = vi.spyOn(
      snapNetworksUtils,
      'createFetchPolicy',
    );

    createClient();

    expect(createFetchPolicySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'token_api',
      }),
    );
  });

  describe('fetchAssetsByAssetIds', () => {
    it('requests token API with assetIds in query and returns parsed body', async () => {
      const body = [
        tokenMetadataResponse(USDC_IOU, {
          name: 'USD Coin',
          symbol: 'USDC',
        }),
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(body));

      const client = createClient();
      const result = await client.fetchAssetsByAssetIds([USDC_IOU]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0]?.[0]).toBe(
        buildUrl({
          baseUrl,
          path: '/v3/assets',
          queryParams: { assetIds: USDC_IOU },
        }),
      );
      expect(result).toStrictEqual(body);
    });

    it('joins multiple asset ids in the query param', async () => {
      const body = [
        tokenMetadataResponse(USDC_MPT, {
          decimals: 6,
          name: 'A',
          symbol: 'A',
        }),
        tokenMetadataResponse(USDT_MPT, {
          decimals: 6,
          name: 'B',
          symbol: 'B',
        }),
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(body));

      const client = createClient();
      await client.fetchAssetsByAssetIds([USDC_MPT, USDT_MPT]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const urlArg = mockFetch.mock.calls[0]?.[0];
      expect(typeof urlArg).toBe('string');
      const assetIdsParam = new URL(urlArg as string).searchParams.get(
        'assetIds',
      );
      expect(assetIdsParam).toBe(`${USDC_MPT},${USDT_MPT}`);
    });

    it('throws HttpResponseException when response is not ok', async () => {
      mockFetch.mockResolvedValue(jsonResponse([], { ok: false, status: 503 }));

      const client = createClient();
      await expect(client.fetchAssetsByAssetIds([USDC_IOU])).rejects.toThrow(
        HttpResponseException,
      );
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('retries when reading the response body fails', async () => {
      const body = [
        tokenMetadataResponse(USDC_IOU, {
          name: 'USD Coin',
          symbol: 'USDC',
        }),
      ];
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: vi.fn().mockRejectedValueOnce(new Error('Body failed')),
        } as unknown as Response)
        .mockResolvedValueOnce(jsonResponse(body));

      expect(
        await createClient().fetchAssetsByAssetIds([USDC_IOU]),
      ).toStrictEqual(body);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws InvalidHttpResponseException when response body is invalid', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ notAnArray: true }));

      const client = createClient();
      await expect(client.fetchAssetsByAssetIds([USDC_IOU])).rejects.toThrow(
        InvalidHttpResponseException,
      );
    });

    it('throws HttpException when fetch rejects', async () => {
      const networkError = Object.assign(new Error('network down'), {
        cause: { code: 'ECONNREFUSED' },
      });
      mockFetch.mockRejectedValue(networkError);

      const client = createClient();
      await expect(client.fetchAssetsByAssetIds([USDC_IOU])).rejects.toThrow(
        HttpException,
      );
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('fetchAssetsByChainId', () => {
    it('requests chain token API and returns parsed body', async () => {
      const body = {
        data: [
          tokenMetadataResponse(USDC_MPT, {
            decimals: 6,
            name: 'A',
            symbol: 'A',
          }),
        ],
        count: 1,
        totalCount: 1,
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(body));

      const client = createClient();
      const result = await client.fetchAssetsByChainId(
        KnownCaip2ChainId.Mainnet,
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0]?.[0]).toBe(
        buildUrl({
          baseUrl,
          path: `/v3/chains/${KnownCaip2ChainId.Mainnet}/assets`,
          queryParams: {
            first: '1000',
            includeIconUrl: 'true',
            includeDuplicateSymbolAssets: 'true',
            useAggregatorIcons: 'true',
          },
        }),
      );
      expect(result).toStrictEqual(body);
    });

    it('returns parsed body when response data is empty', async () => {
      const body = {
        data: [],
        count: 0,
        totalCount: 0,
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(body));

      const client = createClient();
      expect(
        await client.fetchAssetsByChainId(KnownCaip2ChainId.Mainnet),
      ).toStrictEqual(body);
    });

    it('throws HttpResponseException on HTTP error', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ data: [] }, { ok: false, status: 502 }),
      );

      const client = createClient();
      await expect(
        client.fetchAssetsByChainId(KnownCaip2ChainId.Mainnet),
      ).rejects.toThrow(HttpResponseException);
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('throws InvalidHttpResponseException when body does not match schema', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([{ notValid: true }]));

      const client = createClient();
      await expect(
        client.fetchAssetsByChainId(KnownCaip2ChainId.Mainnet),
      ).rejects.toThrow(InvalidHttpResponseException);
    });

    it('throws HttpException when fetch rejects', async () => {
      const networkError = Object.assign(new Error('network down'), {
        cause: { code: 'ECONNREFUSED' },
      });
      mockFetch.mockRejectedValue(networkError);

      const client = createClient();
      await expect(
        client.fetchAssetsByChainId(KnownCaip2ChainId.Mainnet),
      ).rejects.toThrow(HttpException);
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });
});
