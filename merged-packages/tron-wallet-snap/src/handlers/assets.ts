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

import type { AssetsService } from '../services/assets/AssetsService';
import type { ILogger } from '../utils/logger';
import { createPrefixedLogger } from '../utils/logger';

export class AssetsHandler {
  readonly #logger: ILogger;

  readonly #assetsService: AssetsService;

  constructor({
    logger,
    assetsService,
  }: {
    logger: ILogger;
    assetsService: AssetsService;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🪙 AssetsHandler]');
    this.#assetsService = assetsService;
  }

  async onAssetHistoricalPrice(
    _params: OnAssetHistoricalPriceArguments,
  ): Promise<OnAssetHistoricalPriceResponse> {
    return {
      historicalPrice: {
        intervals: {},
        updateTime: Date.now(),
      },
    };
  }

  async onAssetsConversion(
    params: OnAssetsConversionArguments,
  ): Promise<OnAssetsConversionResponse> {
    this.#logger.log('[💱 onAssetsConversion]');

    const { conversions } = params;

    const excludedAssetSuffixes = [
      '/slip44:energy',
      '/slip44:bandwidth',
      '/slip44:195-staked-for-energy',
      '/slip44:195-staked-for-bandwidth',
    ];

    const filteredConversions = conversions.filter(
      (conversion) =>
        !excludedAssetSuffixes.some((suffix) =>
          conversion.from.endsWith(suffix),
        ) &&
        !excludedAssetSuffixes.some((suffix) => conversion.to.endsWith(suffix)),
    );

    const conversionRates =
      await this.#assetsService.getMultipleTokenConversions(
        filteredConversions,
      );

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
