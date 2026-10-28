import type { FetchPolicy, Logger } from '@metamask/snap-networks-utils';
import {
  buildUrl,
  createFetchPolicy,
  fetchWithPolicy,
} from '@metamask/snap-networks-utils';
import { array } from '@metamask/superstruct';

import {
  KnownCaip19AssetIdOrSlip44IdStruct,
  KnownCaip2ChainIdStruct,
} from '../../../api';
import type {
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip2ChainId,
} from '../../../api';
import type { AnyErrorConstructor } from '../../../utils';
import { rethrowIfInstanceElseThrow } from '../../../utils';
import {
  assertHttpRequestParams,
  assertHttpResponse,
  HttpException,
  InvalidHttpRequestParamsException,
  InvalidHttpResponseException,
  normalizeHttpException,
} from '../../../utils/errors';
import { logger } from '../../../utils/logger';
import type {
  TokenMetadataByAssetIdsResponse,
  TokenMetadataByChainIdResponse,
} from './api';
import {
  TokenMetadataByAssetIdsResponseStruct,
  TokenMetadataByChainIdResponseStruct,
} from './api';
import { TokenApiException } from './exceptions';

export class TokenApiClient {
  readonly #fetch: typeof globalThis.fetch;

  readonly #baseUrl: string;

  readonly #policy: FetchPolicy;

  constructor(
    {
      baseUrl,
    }: {
      baseUrl: string;
    },
    _fetch: typeof globalThis.fetch = globalThis.fetch,
    _logger: Logger = logger,
  ) {
    this.#fetch = _fetch;
    this.#baseUrl = baseUrl;
    this.#policy = createFetchPolicy({
      service: 'token_api',
      logger: _logger,
    });
  }

  async getAssetsByAssetIds(
    assetIds: KnownCaip19AssetIdOrSlip44Id[],
  ): Promise<TokenMetadataByAssetIdsResponse> {
    try {
      assertHttpRequestParams(
        assetIds,
        array(KnownCaip19AssetIdOrSlip44IdStruct),
      );

      const url = buildUrl({
        baseUrl: this.#baseUrl,
        path: '/v3/assets',
        queryParams: {
          assetIds: assetIds.join(','),
        },
      });

      const body = await fetchWithPolicy(
        this.#policy,
        url,
        undefined,
        this.#fetch,
      );
      const data = JSON.parse(body);

      assertHttpResponse(data, TokenMetadataByAssetIdsResponseStruct);

      return data;
    } catch (error: unknown) {
      return this.#throwError({
        error,
        fallbackError: 'Failed to fetch token metadata by asset ids',
      });
    }
  }

  /**
   * Fetches all tokens metadata for the given chain ID.
   *
   * @see https://tokens.api.cx.metamask.io/v3/chains/eip155:1329/assets?first=10&includeIconUrl=true&includeDuplicateSymbolAssets=true&useAggregatorIcons=true
   *
   * @param scope - The chain ID to fetch all tokens metadata for.
   * @returns A Promise that resolves to the token metadata responses.
   */
  async getAssetsByChainId(
    scope: KnownCaip2ChainId,
  ): Promise<TokenMetadataByChainIdResponse> {
    try {
      assertHttpRequestParams(scope, KnownCaip2ChainIdStruct);

      const url = buildUrl({
        baseUrl: this.#baseUrl,
        path: `/v3/chains/${scope}/assets`,
        queryParams: {
          first: '1000',
          includeIconUrl: 'true',
          includeDuplicateSymbolAssets: 'true',
          useAggregatorIcons: 'true',
        },
      });

      const body = await fetchWithPolicy(
        this.#policy,
        url,
        undefined,
        this.#fetch,
      );
      const data = JSON.parse(body);

      assertHttpResponse(data, TokenMetadataByChainIdResponseStruct);

      return data;
    } catch (error: unknown) {
      return this.#throwError({
        error,
        fallbackError: 'Failed to fetch token metadata by chain id',
      });
    }
  }

  #throwError({
    error,
    exceptionClasses,
    fallbackError,
  }: {
    error: unknown;
    exceptionClasses?: readonly AnyErrorConstructor[];
    fallbackError: string | TokenApiException;
  }): never {
    const normalized = normalizeHttpException(error);
    if (normalized instanceof HttpException) {
      throw normalized;
    }

    return rethrowIfInstanceElseThrow(
      normalized,
      [
        TokenApiException,
        InvalidHttpRequestParamsException,
        InvalidHttpResponseException,
        ...(exceptionClasses ?? []),
      ],
      fallbackError instanceof Error
        ? fallbackError
        : new TokenApiException(String(fallbackError), { cause: error }),
    );
  }
}
