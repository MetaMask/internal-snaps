import type { Infer } from '@metamask/superstruct';
import {
  array,
  enums,
  min,
  nullable,
  number,
  object,
  record,
  string,
  type,
  union,
} from '@metamask/superstruct';
import { CaipAssetTypeStruct } from '@metamask/utils';

/**
 * The structure of the spot price response from the MetaMask Price API, limited
 * to the fields this Snap consumes. The API may return additional fields; they
 * are ignored.
 */
export const SpotPriceStruct = type({
  id: string(),
  price: min(number(), 0),
});

export type SpotPrice = Infer<typeof SpotPriceStruct>;

export const CryptoTickerStruct = enums([
  'btc',
  'eth',
  'ltc',
  'bch',
  'bnb',
  'eos',
  'xrp',
  'xlm',
  'link',
  'dot',
  'yfi',
  'bits',
  'sats',
  'sol',
  'sei',
  'sonic',
]);

export const FiatTickerStruct = enums([
  'usd',
  'aed',
  'amd',
  'ars',
  'aud',
  'bam',
  'bdt',
  'bhd',
  'bmd',
  'brl',
  'cad',
  'chf',
  'clp',
  'cny',
  'cop',
  'crc',
  'czk',
  'dkk',
  'dop',
  'eur',
  'gbp',
  'gel',
  'gtq',
  'hkd',
  'hnl',
  'huf',
  'idr',
  'ils',
  'inr',
  'jpy',
  'kes',
  'krw',
  'kwd',
  'lbp',
  'lkr',
  'mmk',
  'mxn',
  'myr',
  'ngn',
  'nok',
  'nzd',
  'pen',
  'php',
  'pkr',
  'pln',
  'ron',
  'rub',
  'sar',
  'sek',
  'sgd',
  'svc',
  'thb',
  'try',
  'twd',
  'uah',
  'vef',
  'vnd',
  'xdr',
  'zar',
  'zmw',
]);

export const CommodityTickerStruct = enums(['xag', 'xau']);

export type CryptoTicker = Infer<typeof CryptoTickerStruct>;
export type FiatTicker = Infer<typeof FiatTickerStruct>;
export type CommodityTicker = Infer<typeof CommodityTickerStruct>;

export const TickerStruct = union([
  CryptoTickerStruct,
  FiatTickerStruct,
  CommodityTickerStruct,
]);

export type Ticker = Infer<typeof TickerStruct>;

/**
 * @example
 * {
 *   "bip122:000000000019d6689c085ae165831e93/slip44:0": {
 *     "id": "bitcoin",
 *     "price": 84302
 *   },
 *   "eip155:1/slip44:60": { ... },
 *   "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501": null
 */
export const GetSpotPricesResponseStruct = record(
  CaipAssetTypeStruct,
  nullable(SpotPriceStruct),
);

export type SpotPricesResponse = Infer<typeof GetSpotPricesResponseStruct>;

// In the Price API source code, the parameters `vsCurrency` and `ticker` represent the same list of values.
// We create aliases here for clarity.
export const VsCurrencyParamStruct = TickerStruct;
export type VsCurrencyParam = Infer<typeof VsCurrencyParamStruct>;

export const GetSpotPricesParamsStruct = object({
  // TODO: add validation to ensure the array is not empty
  assetIds: array(CaipAssetTypeStruct),
  vsCurrency: VsCurrencyParamStruct,
});
