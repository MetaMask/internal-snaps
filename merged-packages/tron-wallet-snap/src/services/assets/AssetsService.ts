import {
  KeyringEvent,
  type AccountAssetListUpdatedEvent,
  type AccountBalancesUpdatedEvent,
  type KeyringAccount,
} from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import type {
  AssetConversion,
  AssetMetadata,
  FungibleAssetMarketData,
  FungibleAssetMetadata,
} from '@metamask/snaps-sdk';
import type { CaipAssetType } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { pick } from 'lodash';

import type { AssetsRepository } from './AssetsRepository';
import type {
  NativeCaipAssetType,
  NftCaipAssetType,
  TokenCaipAssetType,
} from './types';
import type { PriceApiClient } from '../../clients/price-api/PriceApiClient';
import type { FiatTicker, SpotPrice } from '../../clients/price-api/types';
import type { TronHttpClient } from '../../clients/tron-http/TronHttpClient';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import type { TronAccount } from '../../clients/trongrid/types';
import type { Network } from '../../constants';
import { configProvider } from '../../context';
import type { AssetEntity } from '../../entities/assets';
import { createPrefixedLogger, type ILogger } from '../../utils/logger';
import type { State, UnencryptedStateValue } from '../state/State';

export class AssetsService {
  readonly #logger: ILogger;

  readonly #assetsRepository: AssetsRepository;

  readonly #state: State<UnencryptedStateValue>;

  readonly #trongridApiClient: TrongridApiClient;

  readonly #tronHttpClient: TronHttpClient;

  readonly #priceApiClient: PriceApiClient;

  readonly cacheTtlsMilliseconds: {
    fiatExchangeRates: number;
    spotPrices: number;
    historicalPrices: number;
  };

  constructor({
    logger,
    assetsRepository,
    state,
    trongridApiClient,
    tronHttpClient,
    priceApiClient,
  }: {
    logger: ILogger;
    assetsRepository: AssetsRepository;
    state: State<UnencryptedStateValue>;
    trongridApiClient: TrongridApiClient;
    tronHttpClient: TronHttpClient;
    priceApiClient: PriceApiClient;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🪙 AssetsService]');
    this.#assetsRepository = assetsRepository;
    this.#state = state;
    this.#trongridApiClient = trongridApiClient;
    this.#tronHttpClient = tronHttpClient;
    this.#priceApiClient = priceApiClient;

    const { cacheTtlsMilliseconds } = configProvider.get().priceApi;
    this.cacheTtlsMilliseconds = cacheTtlsMilliseconds;
  }

  async fetchAssetsAndBalancesForAccount(
    scope: Network,
    account: KeyringAccount,
  ): Promise<AssetEntity[]> {
    this.#logger.info('Fetching assets and balances by account', {
      account,
      scope,
    });

    const tronAccountInfo =
      await this.#trongridApiClient.getAccountInfoByAddress(
        scope,
        account.address,
      );

    const nativeAsset = this.#extractNativeAsset({
      account,
      scope,
      tronAccountInfo,
    });
    const trc10Assets = this.#extractTrc10Assets({
      account,
      scope,
      tronAccountInfo,
    });
    const trc20Assets = this.#extractTrc20Assets({
      account,
      scope,
      tronAccountInfo,
    });

    const assetTypes = [
      nativeAsset.assetType,
      ...trc10Assets.map((tokenAsset) => tokenAsset.assetType),
      ...trc20Assets.map((tokenAsset) => tokenAsset.assetType),
    ];
    const assetsMetadata = await this.getAssetsMetadata(assetTypes);

    const assets = [nativeAsset, ...trc10Assets, ...trc20Assets].map(
      (asset) => {
        const metadata = assetsMetadata[asset.assetType];
        const mergedAsset = {
          ...asset,
          ...metadata,
        } as any;

        const unit = metadata?.fungible ? metadata.units?.[0] : undefined;

        if (unit) {
          const decimals = new BigNumber(mergedAsset.rawAmount).dividedBy(
            new BigNumber(10).pow(unit.decimals),
          );
          mergedAsset.uiAmount = decimals.toString();
        } else {
          mergedAsset.uiAmount = '0';
        }

        return mergedAsset;
      },
    );

    return assets;
  }

  static isFiat(caipAssetId: CaipAssetType): boolean {
    return caipAssetId.includes('swift:0/iso4217:');
  }

  #extractNativeAsset({
    account,
    scope,
    tronAccountInfo,
  }: {
    account: KeyringAccount;
    scope: Network;
    tronAccountInfo: TronAccount;
  }): AssetEntity {
    const asset: AssetEntity = {
      assetType: `${scope}/slip44:195` as NativeCaipAssetType,
      keyringAccountId: account.id,
      network: scope,
      address: account.address,
      symbol: 'TRX',
      decimals: 6,
      rawAmount: tronAccountInfo.balance.toString(),
      uiAmount: new BigNumber(tronAccountInfo.balance)
        .dividedBy(10 ** 6)
        .toString(),
    };

    return asset;
  }

  #extractTrc10Assets({
    account,
    scope,
    tronAccountInfo,
  }: {
    account: KeyringAccount;
    scope: Network;
    tronAccountInfo: TronAccount;
  }): AssetEntity[] {
    const { assetV2 } = tronAccountInfo;

    const trc10Assets =
      assetV2?.flatMap((tokenObject) => {
        return Object.entries(tokenObject).map(([address, balance]) => {
          return {
            assetType: `${scope}/trc10:${address}` as TokenCaipAssetType,
            keyringAccountId: account.id,
            network: scope,
            mint: address,
            pubkey: address,
            symbol: '',
            decimals: 0,
            rawAmount: balance,
            uiAmount: '0',
          };
        });
      }) ?? [];

    return trc10Assets;
  }

  #extractTrc20Assets({
    account,
    scope,
    tronAccountInfo,
  }: {
    account: KeyringAccount;
    scope: Network;
    tronAccountInfo: TronAccount;
  }): AssetEntity[] {
    const { trc20 } = tronAccountInfo;

    const trc20Assets =
      trc20?.flatMap((tokenObject) => {
        return Object.entries(tokenObject).map(([address, balance]) => {
          return {
            assetType: `${scope}/trc20:${address}` as TokenCaipAssetType,
            keyringAccountId: account.id,
            network: scope,
            mint: address,
            pubkey: address,
            symbol: '',
            decimals: 0,
            rawAmount: balance,
            uiAmount: '0',
          };
        });
      }) ?? [];

    return trc20Assets;
  }

  async getAssetsMetadata(
    assetTypes: CaipAssetType[],
  ): Promise<Record<CaipAssetType, AssetMetadata | null>> {
    this.#logger.info('Fetching metadata for assets', assetTypes);

    const { nativeAssetTypes, tokenTrc10AssetTypes, tokenTrc20AssetTypes } =
      this.#splitAssetsByType(assetTypes);

    const [nativeTokensMetadata, trc10TokensMetadata, trc20TokensMetadata] =
      await Promise.all([
        this.#getNativeTokensMetadata(nativeAssetTypes),
        this.#getTRC10TokensMetadata(tokenTrc10AssetTypes),
        this.#getTRC20TokensMetadata(tokenTrc20AssetTypes),
      ]);

    const result = {
      ...nativeTokensMetadata,
      ...trc10TokensMetadata,
      ...trc20TokensMetadata,
    };

    this.#logger.info('Resolved assets metadata', { assetTypes, result });

    return result;
  }

  #splitAssetsByType(assetTypes: CaipAssetType[]): {
    nativeAssetTypes: NativeCaipAssetType[];
    tokenTrc10AssetTypes: TokenCaipAssetType[];
    tokenTrc20AssetTypes: TokenCaipAssetType[];
    nftAssetTypes: NftCaipAssetType[];
  } {
    const nativeAssetTypes = assetTypes.filter((assetType) =>
      assetType.endsWith('/slip44:195'),
    ) as NativeCaipAssetType[];
    const tokenTrc10AssetTypes = assetTypes.filter((assetType) =>
      assetType.includes('/trc10:'),
    ) as TokenCaipAssetType[];
    const tokenTrc20AssetTypes = assetTypes.filter((assetType) =>
      assetType.includes('/trc20:'),
    ) as TokenCaipAssetType[];
    const nftAssetTypes = assetTypes.filter((assetType) =>
      assetType.includes('/trc721:'),
    ) as NftCaipAssetType[];

    return {
      nativeAssetTypes,
      tokenTrc10AssetTypes,
      tokenTrc20AssetTypes,
      nftAssetTypes,
    };
  }

  #getNativeTokensMetadata(
    assetTypes: NativeCaipAssetType[],
  ): Record<CaipAssetType, FungibleAssetMetadata | null> {
    const nativeTokensMetadata: Record<
      CaipAssetType,
      FungibleAssetMetadata | null
    > = {};

    for (const assetType of assetTypes) {
      // const { chainId } = parseCaipAssetType(assetType);
      nativeTokensMetadata[assetType] = {
        name: 'Tron',
        symbol: 'TRX',
        fungible: true as const,
        // iconUrl: `${this.#configProvider.get().staticApi.baseUrl}/api/v2/tokenIcons/assets/tron/${chainId}/slip44/195.png`,
        iconUrl:
          'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
        units: [
          {
            name: 'Tron',
            symbol: 'TRX',
            decimals: 6,
          },
        ],
      };
    }

    return nativeTokensMetadata;
  }

  async #getTRC10TokensMetadata(
    assetTypes: TokenCaipAssetType[],
  ): Promise<Record<TokenCaipAssetType, FungibleAssetMetadata | null>> {
    const metadata = await Promise.all(
      assetTypes.map(async (assetType) => {
        const { chainId, assetReference } = parseCaipAssetType(assetType);

        const tokenMetadata = await this.#tronHttpClient.getTRC10TokenMetadata(
          assetReference,
          chainId as Network,
        );

        return {
          [assetType]: {
            name: tokenMetadata.name,
            symbol: tokenMetadata.symbol,
            fungible: true as const,
            iconUrl: `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/assets/${assetReference}/logo.png`,
            units: [
              {
                name: tokenMetadata.name,
                symbol: tokenMetadata.symbol,
                decimals: tokenMetadata.decimals,
              },
            ],
          },
        };
      }),
    );

    return metadata.reduce((acc, curr) => {
      return { ...acc, ...curr };
    }, {});
  }

  async #getTRC20TokensMetadata(
    assetTypes: TokenCaipAssetType[],
  ): Promise<Record<TokenCaipAssetType, FungibleAssetMetadata | null>> {
    const metadata = await Promise.all(
      assetTypes.map(async (assetType) => {
        const { assetReference } = parseCaipAssetType(assetType);
        const { name, symbol, decimals } =
          await this.#getTrc20TokenMetadata(assetType);

        return {
          [assetType]: {
            name,
            symbol,
            fungible: true as const,
            iconUrl: `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/assets/${assetReference}/logo.png`,
            units: [{ name, symbol, decimals }],
          },
        };
      }),
    );

    return metadata.reduce((acc, curr) => {
      return { ...acc, ...curr };
    }, {});
  }

  async #getTrc20TokenMetadata(assetType: TokenCaipAssetType): Promise<{
    name: string;
    symbol: string;
    decimals: number;
  }> {
    const { chainId, assetReference } = parseCaipAssetType(assetType);

    const tokenMetadata = await this.#tronHttpClient.getTRC20TokenMetadata(
      assetReference,
      chainId as Network,
    );

    return {
      name: tokenMetadata.name,
      symbol: tokenMetadata.symbol,
      decimals: tokenMetadata.decimals,
    };
  }

  /**
   * Checks if the asset has changed compared to passed assets lookup.
   *
   * @param asset - The asset to check.
   * @param assetsLookup - The lookup table to check against.
   * @returns True if the asset has changed, false otherwise.
   */
  static hasChanged(asset: AssetEntity, assetsLookup: AssetEntity[]): boolean {
    const savedAsset = assetsLookup.find(
      (item) =>
        item.keyringAccountId === asset.keyringAccountId &&
        item.assetType === asset.assetType,
    );

    if (!savedAsset) {
      return true;
    }

    return savedAsset.rawAmount !== asset.rawAmount;
  }

  async saveMany(assets: AssetEntity[]): Promise<void> {
    this.#logger.info('Saving assets', assets);

    const savedAssets = await this.getAll();

    this.#logger.info('Saved assets', { savedAssets });

    const hasZeroRawAmount = (asset: AssetEntity): boolean =>
      asset.rawAmount === '0';
    const hasNonZeroRawAmount = (asset: AssetEntity): boolean =>
      !hasZeroRawAmount(asset);

    // Notify the extension about the new assets in a single event
    const isNew = (asset: AssetEntity): boolean =>
      !savedAssets.find(
        (item) =>
          item.keyringAccountId === asset.keyringAccountId &&
          item.assetType === asset.assetType,
      );

    const wasSavedWithZeroRawAmount = (asset: AssetEntity): boolean => {
      const savedAsset = savedAssets.find(
        (item) =>
          item.keyringAccountId === asset.keyringAccountId &&
          item.assetType === asset.assetType,
      );

      return savedAsset !== undefined && hasZeroRawAmount(savedAsset);
    };

    const assetListUpdatedPayload = assets.reduce<
      AccountAssetListUpdatedEvent['params']['assets']
    >(
      (acc, asset) => ({
        ...acc,
        [asset.keyringAccountId]: {
          added: [
            ...(acc[asset.keyringAccountId]?.added ?? []),
            ...((isNew(asset) || wasSavedWithZeroRawAmount(asset)) &&
            hasNonZeroRawAmount(asset)
              ? [asset.assetType]
              : []),
          ],
          removed: [
            ...(acc[asset.keyringAccountId]?.removed ?? []),
            ...(hasZeroRawAmount(asset) ? [asset.assetType] : []),
          ],
        },
      }),
      {},
    );

    const isEmptyAccountAssetListUpdatedPayload = Object.values(
      assetListUpdatedPayload,
    )
      .map((item) => item.added.length + item.removed.length)
      .every((item) => item === 0);

    if (isEmptyAccountAssetListUpdatedPayload) {
      this.#logger.info('No account asset list updated', {
        assetListUpdatedPayload,
      });
    } else {
      this.#logger.info('Updating account asset list', {
        isEmptyAccountAssetListUpdatedPayload,
        assetListUpdatedPayload,
      });

      await emitSnapKeyringEvent(snap, KeyringEvent.AccountAssetListUpdated, {
        assets: assetListUpdatedPayload,
      });

      this.#logger.info('Account asset list updated', {
        assetListUpdatedPayload,
      });
    }

    // Notify the extension about the changed balances in a single event

    const hasChanged = (asset: AssetEntity): boolean =>
      AssetsService.hasChanged(asset, savedAssets);

    const balancesUpdatedPayload = assets
      .filter(hasNonZeroRawAmount)
      .filter(hasChanged)
      .reduce<AccountBalancesUpdatedEvent['params']['balances']>(
        (acc, asset) => ({
          ...acc,
          [asset.keyringAccountId]: {
            ...(acc[asset.keyringAccountId] ?? {}),
            [asset.assetType]: {
              unit: asset.symbol,
              amount: asset.uiAmount,
            },
          },
        }),
        {},
      );
    const isEmptyAccountBalancesUpdatedPayload = Object.values(
      balancesUpdatedPayload,
    )
      .map((item) => Object.keys(item).length)
      .every((item) => item === 0);

    if (isEmptyAccountBalancesUpdatedPayload) {
      this.#logger.info('No account balances updated', {
        balancesUpdatedPayload,
      });
    } else {
      this.#logger.info('Updating account balances', {
        balancesUpdatedPayload,
      });

      await emitSnapKeyringEvent(snap, KeyringEvent.AccountBalancesUpdated, {
        balances: balancesUpdatedPayload,
      });

      this.#logger.info('Account balances updated', {
        balancesUpdatedPayload,
      });
    }
  }

  async getAll(): Promise<AssetEntity[]> {
    const assetsByAccount =
      (await this.#state.getKey<UnencryptedStateValue['assets']>('assets')) ??
      {};

    return Object.values(assetsByAccount).flat();
  }

  async getByKeyringAccountId(
    keyringAccountId: string,
  ): Promise<AssetEntity[]> {
    return this.#assetsRepository.getByAccountId(keyringAccountId);
  }

  /**
   * Extracts the ISO 4217 currency code (aka fiat ticker) from a fiat CAIP-19 asset type.
   *
   * @param caipAssetType - The CAIP-19 asset type.
   * @returns The fiat ticker.
   */
  #extractFiatTicker(caipAssetType: CaipAssetType): FiatTicker {
    if (!AssetsService.isFiat(caipAssetType)) {
      throw new Error('Passed caipAssetType is not a fiat asset');
    }

    const fiatTicker =
      parseCaipAssetType(caipAssetType).assetReference.toLowerCase();

    return fiatTicker as FiatTicker;
  }

  /**
   * Fetches fiat exchange rates and crypto prices for the given assets.
   * This is shared logic between getMultipleTokenConversions and getMultipleTokensMarketData.
   *
   * @param allAssets - Array of all CAIP asset types (both fiat and crypto).
   * @returns Promise resolving to fiat exchange rates and crypto prices.
   */
  async #fetchPriceData(allAssets: CaipAssetType[]): Promise<{
    fiatExchangeRates: Record<string, { value: number }>;
    cryptoPrices: Record<CaipAssetType, SpotPrice | null>;
  }> {
    const cryptoAssets = allAssets.filter(
      (asset) => !AssetsService.isFiat(asset),
    );

    const [fiatExchangeRates, cryptoPrices] = await Promise.all([
      this.#priceApiClient.getFiatExchangeRates(),
      this.#priceApiClient.getMultipleSpotPrices(cryptoAssets, 'usd'),
    ]);

    return { fiatExchangeRates, cryptoPrices };
  }

  /**
   * Get the token conversions for a list of asset pairs.
   * It caches the results for 1 hour.
   *
   * Beware: Inside we are using the Price API's `getFiatExchangeRates` method for fiat prices,
   * `getMultipleSpotPrices` for crypto prices and then using USD as an intermediate currency
   * to convert the prices to the correct currency. This is not entirely accurate but it's the
   * best we can do with the current API.
   *
   * @param conversions - The asset pairs to get the conversions for.
   * @returns The token conversions.
   */
  async getMultipleTokenConversions(
    conversions: { from: CaipAssetType; to: CaipAssetType }[],
  ): Promise<
    Record<CaipAssetType, Record<CaipAssetType, AssetConversion | null>>
  > {
    if (conversions.length === 0) {
      return {};
    }

    /**
     * `from` and `to` can represent both fiat and crypto assets. For us to get their values
     * the best approach is to use Price API's `getFiatExchangeRates` method for fiat prices,
     * `getMultipleSpotPrices` for crypto prices and then using USD as an intermediate currency
     * to convert the prices to the correct currency.
     */
    const allAssets = conversions.flatMap((conversion) => [
      conversion.from,
      conversion.to,
    ]);

    const { fiatExchangeRates, cryptoPrices } =
      await this.#fetchPriceData(allAssets);

    /**
     * Now that we have the data, convert the `from`s to `to`s.
     *
     * We need to handle the following cases:
     * 1. `from` and `to` are both fiat
     * 2. `from` and `to` are both crypto
     * 3. `from` is fiat and `to` is crypto
     * 4. `from` is crypto and `to` is fiat
     *
     * We also need to keep in mind that although `cryptoPrices` are indexed
     * by CAIP 19 IDs, the `fiatExchangeRates` are indexed by currency symbols.
     * To convert fiat currency symbols to CAIP 19 IDs, we can use the
     * `this.#fiatSymbolToCaip19Id` method.
     */

    const result: Record<
      CaipAssetType,
      Record<CaipAssetType, AssetConversion | null>
    > = {};

    conversions.forEach((conversion) => {
      const { from, to } = conversion;

      result[from] ??= {};

      let fromUsdRate: BigNumber;
      let toUsdRate: BigNumber;

      if (AssetsService.isFiat(from)) {
        /**
         * Beware:
         * We need to invert the fiat exchange rate because exchange rate != spot price
         */
        const fiatExchangeRate =
          fiatExchangeRates[this.#extractFiatTicker(from)]?.value;

        if (!fiatExchangeRate) {
          result[from][to] = null;
          return;
        }

        fromUsdRate = new BigNumber(1).dividedBy(fiatExchangeRate);
      } else {
        fromUsdRate = new BigNumber(cryptoPrices[from]?.price ?? 0);
      }

      if (AssetsService.isFiat(to)) {
        /**
         * Beware:
         * We need to invert the fiat exchange rate because exchange rate != spot price
         */
        const fiatExchangeRate =
          fiatExchangeRates[this.#extractFiatTicker(to)]?.value;

        if (!fiatExchangeRate) {
          result[from][to] = null;
          return;
        }

        toUsdRate = new BigNumber(1).dividedBy(fiatExchangeRate);
      } else {
        toUsdRate = new BigNumber(cryptoPrices[to]?.price ?? 0);
      }

      if (fromUsdRate.isZero() || toUsdRate.isZero()) {
        result[from][to] = null;
        return;
      }

      const rate = fromUsdRate.dividedBy(toUsdRate).toString();

      const now = Date.now();

      result[from][to] = {
        rate,
        conversionTime: now,
        expirationTime: now + this.cacheTtlsMilliseconds.historicalPrices,
      };
    });

    return result;
  }

  /**
   * Computes the market data object in the target currency.
   *
   * @param spotPrice - The spot price of the asset in source currency.
   * @param rate - The rate to convert the market data to from source currency to target currency.
   * @returns The market data in the target currency.
   */
  #computeMarketData(
    spotPrice: SpotPrice,
    rate: BigNumber,
  ): FungibleAssetMarketData {
    const marketDataInUsd = pick(spotPrice, [
      'marketCap',
      'totalVolume',
      'circulatingSupply',
      'allTimeHigh',
      'allTimeLow',
      'pricePercentChange1h',
      'pricePercentChange1d',
      'pricePercentChange7d',
      'pricePercentChange14d',
      'pricePercentChange30d',
      'pricePercentChange200d',
      'pricePercentChange1y',
    ]);

    const toCurrency = (value: number | null | undefined): string => {
      return value === null || value === undefined
        ? ''
        : new BigNumber(value).dividedBy(rate).toString();
    };

    const includeIfDefined = (
      key: string,
      value: number | null | undefined,
    ): Record<string, number> => {
      return value === null || value === undefined ? {} : { [key]: value };
    };

    // Variations in percent don't need to be converted, they are independent of the currency
    const pricePercentChange = {
      ...includeIfDefined('PT1H', marketDataInUsd.pricePercentChange1h),
      ...includeIfDefined('P1D', marketDataInUsd.pricePercentChange1d),
      ...includeIfDefined('P7D', marketDataInUsd.pricePercentChange7d),
      ...includeIfDefined('P14D', marketDataInUsd.pricePercentChange14d),
      ...includeIfDefined('P30D', marketDataInUsd.pricePercentChange30d),
      ...includeIfDefined('P200D', marketDataInUsd.pricePercentChange200d),
      ...includeIfDefined('P1Y', marketDataInUsd.pricePercentChange1y),
    };

    const marketDataInToCurrency = {
      fungible: true,
      marketCap: toCurrency(marketDataInUsd.marketCap),
      totalVolume: toCurrency(marketDataInUsd.totalVolume),
      circulatingSupply: (marketDataInUsd.circulatingSupply ?? 0).toString(), // Circulating supply counts the number of tokens in circulation, so we don't convert
      allTimeHigh: toCurrency(marketDataInUsd.allTimeHigh),
      allTimeLow: toCurrency(marketDataInUsd.allTimeLow),
      //   Add pricePercentChange field only if it has values
      ...(Object.keys(pricePercentChange).length > 0
        ? { pricePercentChange }
        : {}),
    } as FungibleAssetMarketData;

    return marketDataInToCurrency;
  }

  async getMultipleTokensMarketData(
    assets: {
      asset: CaipAssetType;
      unit: CaipAssetType;
    }[],
  ): Promise<
    Record<CaipAssetType, Record<CaipAssetType, FungibleAssetMarketData>>
  > {
    if (assets.length === 0) {
      return {};
    }

    /**
     * `asset` and `unit` can represent both fiat and crypto assets. For us to get their values
     * the best approach is to use Price API's `getFiatExchangeRates` method for fiat prices,
     * `getMultipleSpotPrices` for crypto prices and then using USD as an intermediate currency
     * to convert the prices to the correct currency.
     */
    const allAssets = assets.flatMap((asset) => [asset.asset, asset.unit]);

    const { fiatExchangeRates, cryptoPrices } =
      await this.#fetchPriceData(allAssets);

    const result: Record<
      CaipAssetType,
      Record<CaipAssetType, FungibleAssetMarketData>
    > = {};

    assets.forEach((asset) => {
      const { asset: assetType, unit } = asset;

      // Skip if we don't have price data for the asset
      if (!cryptoPrices[assetType]) {
        return;
      }

      let unitUsdRate: BigNumber;

      if (AssetsService.isFiat(unit)) {
        /**
         * Beware:
         * We need to invert the fiat exchange rate because exchange rate != spot price
         */
        const fiatExchangeRate =
          fiatExchangeRates[this.#extractFiatTicker(unit)]?.value;

        if (!fiatExchangeRate) {
          return;
        }

        unitUsdRate = new BigNumber(1).dividedBy(fiatExchangeRate);
      } else {
        unitUsdRate = new BigNumber(cryptoPrices[unit]?.price ?? 0);
      }

      if (unitUsdRate.isZero()) {
        return;
      }

      // Initialize the nested structure for the asset if it doesn't exist
      result[assetType] ??= {};

      // Store the market data with the unit as the key
      result[assetType][unit] = this.#computeMarketData(
        cryptoPrices[assetType],
        unitUsdRate,
      );
    });

    return result;
  }
}
