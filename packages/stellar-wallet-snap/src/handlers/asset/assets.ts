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
import { assert } from '@metamask/superstruct';

import type { AssetMetadataService } from '../../services/asset-metadata/AssetMetadataService';
import type { PriceService } from '../../services/price/PriceService';
import { withCatchAndThrowSnapError } from '../../utils/errors';
import { OnAssetsLookupRequestStruct } from './api';

export class AssetsHandler {
  readonly #logger: Logger;

  readonly #assetMetadataService: AssetMetadataService;

  readonly #priceService: PriceService;

  constructor({
    logger,
    assetMetadataService,
    priceService,
  }: {
    logger: Logger;
    assetMetadataService: AssetMetadataService;
    priceService: PriceService;
  }) {
    this.#logger = logger.withPrefix('[🪙 AssetsHandler]');
    this.#assetMetadataService = assetMetadataService;
    this.#priceService = priceService;
  }

  async onAssetHistoricalPrice(
    params: OnAssetHistoricalPriceArguments,
  ): Promise<OnAssetHistoricalPriceResponse> {
    return await withCatchAndThrowSnapError(async () => {
      this.#logger.debug('[📈 onAssetHistoricalPrice]', params);

      const { from, to } = params;

      const historicalPrice =
        await this.#priceService.getHistoricalPriceWithAllTimePeriods(from, to);

      return {
        historicalPrice,
      };
    });
  }

  async onAssetsConversion(
    params: OnAssetsConversionArguments,
  ): Promise<OnAssetsConversionResponse> {
    return await withCatchAndThrowSnapError(async () => {
      this.#logger.debug('[📈 onAssetsConversion]', params);

      const { conversions } = params;

      const conversionRates =
        await this.#priceService.getMultipleTokenConversions(conversions);

      return {
        conversionRates,
      };
    });
  }

  async onAssetsLookup(
    params: OnAssetsLookupArguments,
  ): Promise<OnAssetsLookupResponse> {
    return await withCatchAndThrowSnapError(async () => {
      this.#logger.debug('[🔍 onAssetsLookup]', params);
      // Ensure we only support Stellar assets here.
      assert(params, OnAssetsLookupRequestStruct);

      const assetMetadata =
        await this.#assetMetadataService.getAssetsMetadataByAssetIds(
          params.assets,
        );

      return {
        assets: assetMetadata,
      };
    });
  }

  async onAssetsMarketData(
    params: OnAssetsMarketDataArguments,
  ): Promise<OnAssetsMarketDataResponse> {
    return await withCatchAndThrowSnapError(async () => {
      this.#logger.debug('[🔍 onAssetsMarketData]', params);

      const marketData = await this.#priceService.getMultipleTokensMarketData(
        params.assets,
      );

      return { marketData };
    });
  }
}
