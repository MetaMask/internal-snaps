import { UrlStruct, buildUrl } from '@metamask/snap-networks-utils';
import { assert } from '@metamask/superstruct';
import type { CaipAssetType } from '@metamask/utils';

import type { AnyErrorConstructor } from '../../../utils';
import { rethrowIfInstanceElseThrow } from '../../../utils';
import {
  assertHttpRequestParams,
  assertHttpResponse,
  HttpException,
  HttpResponseException,
  InvalidHttpRequestParamsException,
  InvalidHttpResponseException,
  normalizeHttpException,
} from '../../../utils/errors';
import type { SpotPricesResponse, VsCurrencyParam } from './api';
import { GetSpotPricesParamsStruct, GetSpotPricesResponseStruct } from './api';
import { PriceApiException } from './exceptions';

export class PriceApiClient {
  readonly #fetch: typeof globalThis.fetch;

  readonly #baseUrl: string;

  constructor(
    {
      baseUrl,
    }: {
      baseUrl: string;
    },
    _fetch: typeof globalThis.fetch = globalThis.fetch,
  ) {
    assert(baseUrl, UrlStruct);

    this.#fetch = _fetch;
    this.#baseUrl = baseUrl;
  }

  async getSpotPrices(
    assetIds: CaipAssetType[],
    vsCurrency: VsCurrencyParam | string = 'usd',
  ): Promise<SpotPricesResponse> {
    try {
      assertHttpRequestParams(
        {
          assetIds,
          vsCurrency,
        },
        GetSpotPricesParamsStruct,
      );

      const url = buildUrl({
        baseUrl: this.#baseUrl,
        path: '/v3/spot-prices',
        queryParams: {
          vsCurrency,
          assetIds: assetIds.join(','),
        },
      });

      const response = await this.#fetch(url);

      if (!response.ok) {
        throw new HttpResponseException(response.status);
      }

      const spotPrices = await response.json();
      assertHttpResponse(spotPrices, GetSpotPricesResponseStruct);

      return spotPrices;
    } catch (error: unknown) {
      return this.#throwError({
        error,
        fallbackError: 'Error fetching spot prices',
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
    fallbackError: string | PriceApiException;
  }): never {
    const normalized = normalizeHttpException(error);
    if (normalized instanceof HttpException) {
      throw normalized;
    }

    return rethrowIfInstanceElseThrow(
      normalized,
      [
        PriceApiException,
        InvalidHttpRequestParamsException,
        InvalidHttpResponseException,
        ...(exceptionClasses ?? []),
      ],
      fallbackError instanceof Error
        ? fallbackError
        : new PriceApiException(String(fallbackError), { cause: error }),
    );
  }
}
