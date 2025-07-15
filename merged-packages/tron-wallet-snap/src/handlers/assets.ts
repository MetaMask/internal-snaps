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
    params: OnAssetHistoricalPriceArguments,
  ): Promise<OnAssetHistoricalPriceResponse> {
    return {
      historicalPrice: {
        intervals: {},
        updateTime: Date.now(),
      },
    };
  }

  async onAssetsConversion(
    conversions: OnAssetsConversionArguments,
  ): Promise<OnAssetsConversionResponse> {
    return { conversionRates: {} };
  }

  async onAssetsLookup(
    params: OnAssetsLookupArguments,
  ): Promise<OnAssetsLookupResponse> {
    return { assets: {} };
  }

  async onAssetsMarketData(
    assets: OnAssetsMarketDataArguments,
  ): Promise<OnAssetsMarketDataResponse> {
    return { marketData: {} };
  }
}
