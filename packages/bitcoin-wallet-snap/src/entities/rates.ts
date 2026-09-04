import type { FungibleAssetMarketData } from '@metamask/snaps-sdk';

export type SpotPrice = {
  price: number;
  marketData: FungibleAssetMarketData;
};

export type AssetRatesClient = {
  /**
   * Returns the spot price of an asset relative to an other including market data.
   *
   * @param vsCurrency - the currency to convert prices to. Defaults to 'usd'.
   * @param baseCurrency - the currency to get prices for. Defaults to 'bitcoin'.
   */
  spotPrices(vsCurrency?: string, baseCurrency?: string): Promise<SpotPrice>;
};
