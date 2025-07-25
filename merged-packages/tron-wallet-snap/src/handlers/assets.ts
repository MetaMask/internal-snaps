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

import context from '../context';

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
    return {
      conversionRates: {
        'tron:728126428/slip44:195': {
          'swift:0/iso4217:USD': {
            rate: '0.27',
            conversionTime: Date.now(),
            expirationTime: Date.now() + 1000 * 60 * 60 * 24,
          },
        },
      },
    };
  }

  async onAssetsLookup(
    _params: OnAssetsLookupArguments,
  ): Promise<OnAssetsLookupResponse> {
    const assets = await context.assetsService.getAssetsMetadata(params.assets);

    return {
      assets,
    };
  }

  async onAssetsMarketData(
    _assets: OnAssetsMarketDataArguments,
  ): Promise<OnAssetsMarketDataResponse> {
    return { marketData: {} };
  }
}
