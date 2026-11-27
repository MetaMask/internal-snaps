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

function createJsonResponse(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): Response {
  const { ok = true, status = ok ? 200 : 500 } = init;
  return {
    ok,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function createTokenMetadataResponse(
  assetId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    assetId,
    decimals: IOU_DECIMAL_PLACES,
    ...overrides,
  };
}

function createClientTest(): {
  client: TokenApiClient;
  mockFetch: MockedFunction<typeof fetch>;
} {
  const mockFetch = vi.fn() as MockedFunction<typeof fetch>;
  return {
    client: new TokenApiClient({ baseUrl }, mockFetch),
    mockFetch,
  };
}

describe('TokenApiClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a fetch policy for the token API', () => {
    const createFetchPolicySpy = vi.spyOn(
      snapNetworksUtils,
      'createFetchPolicy',
    );

    createClientTest();

    expect(createFetchPolicySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'token_api',
      }),
    );
  });

  describe('fetchAssetsByAssetIds', () => {
    it('requests token API with assetIds in query and returns parsed body', async () => {
      const body = [
        createTokenMetadataResponse(USDC_IOU, {
          name: 'USD Coin',
          symbol: 'USDC',
        }),
      ];
      const { client, mockFetch } = createClientTest();
      mockFetch.mockResolvedValueOnce(createJsonResponse(body));

      const result = await client.fetchAssetsByAssetIds([USDC_IOU]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0]?.[0]).toStrictEqual(
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
        createTokenMetadataResponse(USDC_MPT, {
          decimals: 6,
          name: 'A',
          symbol: 'A',
        }),
        createTokenMetadataResponse(USDT_MPT, {
          decimals: 6,
          name: 'B',
          symbol: 'B',
        }),
      ];
      const { client, mockFetch } = createClientTest();
      mockFetch.mockResolvedValueOnce(createJsonResponse(body));

      await client.fetchAssetsByAssetIds([USDC_MPT, USDT_MPT]);

      const urlArg = mockFetch.mock.calls[0]?.[0];
      expect(typeof urlArg).toStrictEqual('string');
      expect(
        new URL(urlArg as string).searchParams.get('assetIds'),
      ).toStrictEqual(`${USDC_MPT},${USDT_MPT}`);
    });

    it.each([
      {
        name: 'HTTP error response',
        setup: (mockFetch: MockedFunction<typeof fetch>) => {
          mockFetch.mockResolvedValue(
            createJsonResponse([], { ok: false, status: 503 }),
          );
        },
        expected: HttpResponseException,
        fetchCalls: 4,
      },
      {
        name: 'invalid response body',
        setup: (mockFetch: MockedFunction<typeof fetch>) => {
          mockFetch.mockResolvedValueOnce(
            createJsonResponse({ notAnArray: true }),
          );
        },
        expected: InvalidHttpResponseException,
        fetchCalls: 1,
      },
      {
        name: 'network fetch rejection',
        setup: (mockFetch: MockedFunction<typeof fetch>) => {
          mockFetch.mockRejectedValue(
            Object.assign(new Error('network down'), {
              cause: { code: 'ECONNREFUSED' },
            }),
          );
        },
        expected: HttpException,
        fetchCalls: 4,
      },
    ])(
      'throws $expected.name for $name',
      async ({ setup, expected, fetchCalls }) => {
        const { client, mockFetch } = createClientTest();
        setup(mockFetch);

        await expect(client.fetchAssetsByAssetIds([USDC_IOU])).rejects.toThrow(
          expected,
        );
        expect(mockFetch).toHaveBeenCalledTimes(fetchCalls);
      },
    );

    it('retries when reading the response body fails', async () => {
      const body = [
        createTokenMetadataResponse(USDC_IOU, {
          name: 'USD Coin',
          symbol: 'USDC',
        }),
      ];
      const { client, mockFetch } = createClientTest();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: vi.fn().mockRejectedValueOnce(new Error('Body failed')),
        } as unknown as Response)
        .mockResolvedValueOnce(createJsonResponse(body));

      expect(await client.fetchAssetsByAssetIds([USDC_IOU])).toStrictEqual(
        body,
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchAssetsByChainId', () => {
    it.each([
      {
        name: 'populated catalog',
        body: {
          data: [
            createTokenMetadataResponse(USDC_MPT, {
              decimals: 6,
              name: 'A',
              symbol: 'A',
            }),
          ],
          count: 1,
          totalCount: 1,
        },
      },
      {
        name: 'empty catalog',
        body: {
          data: [],
          count: 0,
          totalCount: 0,
        },
      },
    ])('returns parsed body for $name', async ({ body }) => {
      const { client, mockFetch } = createClientTest();
      mockFetch.mockResolvedValueOnce(createJsonResponse(body));

      expect(
        await client.fetchAssetsByChainId(KnownCaip2ChainId.Mainnet),
      ).toStrictEqual(body);
      expect(mockFetch.mock.calls[0]?.[0]).toStrictEqual(
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
    });

    it.each([
      {
        name: 'HTTP error response',
        setup: (mockFetch: MockedFunction<typeof fetch>) => {
          mockFetch.mockResolvedValue(
            createJsonResponse({ data: [] }, { ok: false, status: 502 }),
          );
        },
        expected: HttpResponseException,
        fetchCalls: 4,
      },
      {
        name: 'invalid response body',
        setup: (mockFetch: MockedFunction<typeof fetch>) => {
          mockFetch.mockResolvedValueOnce(
            createJsonResponse([{ notValid: true }]),
          );
        },
        expected: InvalidHttpResponseException,
        fetchCalls: 1,
      },
      {
        name: 'network fetch rejection',
        setup: (mockFetch: MockedFunction<typeof fetch>) => {
          mockFetch.mockRejectedValue(
            Object.assign(new Error('network down'), {
              cause: { code: 'ECONNREFUSED' },
            }),
          );
        },
        expected: HttpException,
        fetchCalls: 4,
      },
    ])(
      'throws $expected.name for $name',
      async ({ setup, expected, fetchCalls }) => {
        const { client, mockFetch } = createClientTest();
        setup(mockFetch);

        await expect(
          client.fetchAssetsByChainId(KnownCaip2ChainId.Mainnet),
        ).rejects.toThrow(expected);
        expect(mockFetch).toHaveBeenCalledTimes(fetchCalls);
      },
    );
  });
});
