import type { Logger } from '@metamask/snap-networks-utils';
import type {
  OnAssetHistoricalPriceArguments,
  OnAssetHistoricalPriceResponse,
  OnAssetsConversionArguments,
  OnAssetsConversionResponse,
  OnAssetsLookupArguments,
  OnAssetsLookupResponse,
  OnAssetsMarketDataArguments,
  OnAssetsMarketDataResponse,
} from '@metamask/snaps-sdk';

import type { PriceApiClient } from '../../clients/price-api/PriceApiClient';

export class AssetsHandler {
  readonly #logger: Logger;

  readonly #priceApiClient: PriceApiClient;

  constructor({
    logger,
    priceApiClient,
  }: {
    logger: Logger;
    priceApiClient: PriceApiClient;
  }) {
    this.#logger = logger.withPrefix('[🪙 AssetsHandler]');
    this.#priceApiClient = priceApiClient;
  }

  async onAssetHistoricalPrice(
    params: OnAssetHistoricalPriceArguments,
  ): Promise<OnAssetHistoricalPriceResponse> {
    this.#logger.log('[📈 onAssetHistoricalPrice]', params);

    const { from, to } = params;

    const historicalPrice = await this.#priceApiClient.getHistoricalPrice(
      from,
      to,
    );

    return {
      historicalPrice,
    };
  }

  async onAssetsConversion(
    params: OnAssetsConversionArguments,
  ): Promise<OnAssetsConversionResponse> {
    this.#logger.log('[💱 onAssetsConversion]');

    const { conversions } = params;

    const conversionRates =
      await this.#priceApiClient.getMultipleTokenConversions(conversions);

    return {
      conversionRates,
    };
  }

  async onAssetsLookup(
    params: OnAssetsLookupArguments,
  ): Promise<OnAssetsLookupResponse> {
    const assets = await this.#priceApiClient.getAssetsMetadata(params.assets);

    return { assets };
  }

  async onAssetsMarketData(
    params: OnAssetsMarketDataArguments,
  ): Promise<OnAssetsMarketDataResponse> {
    const marketData = await this.#priceApiClient.getMultipleTokensMarketData(
      params.assets,
    );

    return { marketData };
  }
}
