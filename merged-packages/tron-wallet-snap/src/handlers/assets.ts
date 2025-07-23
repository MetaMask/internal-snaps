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

export class AssetsHandler {
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
    _conversions: OnAssetsConversionArguments,
  ): Promise<OnAssetsConversionResponse> {
    return { conversionRates: {} };
  }

  async onAssetsLookup(
    _params: OnAssetsLookupArguments,
  ): Promise<OnAssetsLookupResponse> {
    return { assets: {} };
  }

  async onAssetsMarketData(
    _assets: OnAssetsMarketDataArguments,
  ): Promise<OnAssetsMarketDataResponse> {
    return { marketData: {} };
  }
}
