import type { Logger } from '@metamask/snap-networks-utils/logger';
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

import type { AssetsService } from '../../services/assets/AssetsService';

export class AssetsHandler {
  readonly #logger: Logger;

  readonly #assetsService: AssetsService;

  constructor({
    logger,
    assetsService,
  }: {
    logger: Logger;
    assetsService: AssetsService;
  }) {
    this.#logger = logger.withPrefix('[🪙 AssetsHandler]');
    this.#assetsService = assetsService;
  }

  async onAssetHistoricalPrice(
    params: OnAssetHistoricalPriceArguments,
  ): Promise<OnAssetHistoricalPriceResponse> {
    this.#logger.log('[📈 onAssetHistoricalPrice]', params);

    const { from, to } = params;

    const historicalPrice = await this.#assetsService.getHistoricalPrice(
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
      await this.#assetsService.getMultipleTokenConversions(conversions);

    return {
      conversionRates,
    };
  }

  async onAssetsLookup(
    params: OnAssetsLookupArguments,
  ): Promise<OnAssetsLookupResponse> {
    const assets = await this.#assetsService.getAssetsMetadata(params.assets);

    return { assets };
  }

  async onAssetsMarketData(
    params: OnAssetsMarketDataArguments,
  ): Promise<OnAssetsMarketDataResponse> {
    const marketData = await this.#assetsService.getMultipleTokensMarketData(
      params.assets,
    );

    return { marketData };
  }
}
