import type { Caip19AssetId } from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import type { AssetsProvider } from '@metamask/snap-networks-utils';
import type {
  AssetConversion,
  AssetMetadata,
  FungibleAssetMarketData,
  FungibleAssetMetadata,
  HistoricalPriceIntervals,
} from '@metamask/snaps-sdk';
import { assert } from '@metamask/superstruct';
import type { CaipAssetType } from '@metamask/utils';
import { CaipAssetTypeStruct, parseCaipAssetType } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { pick } from 'lodash';

import type { PriceApiClient } from '../../clients/price-api/PriceApiClient';
import type { FiatTicker, SpotPrice } from '../../clients/price-api/types';
import {
  GET_HISTORICAL_PRICES_RESPONSE_NULL_OBJECT,
  VsCurrencyParamStruct,
} from '../../clients/price-api/types';
import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TokenApiClient } from '../../clients/token-api/TokenApiClient';
import type { TronHttpClient } from '../../clients/tron-http/TronHttpClient';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import { Network } from '../../constants';
import {
  BANDWIDTH_METADATA,
  ENERGY_METADATA,
  MAX_BANDWIDTH_METADATA,
  MAX_ENERGY_METADATA,
  TRX_IN_LOCK_PERIOD_METADATA,
  TRX_METADATA,
  TRX_READY_FOR_WITHDRAWAL_METADATA,
  TRX_STAKED_FOR_BANDWIDTH_METADATA,
  TRX_STAKED_FOR_ENERGY_METADATA,
  TRX_STAKING_REWARDS_METADATA,
} from '../../constants';
import { configProvider } from '../../context';
import type { AssetEntity } from '../../entities/assets';
import { createPrefixedLogger } from '../../utils/logger';
import type { ILogger } from '../../utils/logger';
import { SnapAssetsAdapter } from './adapters/SnapAssetsAdapter';
import type { AssetsRepository } from './AssetsRepository';
import { mapControllerAsset } from './mapControllerAsset';
import { isSnapOwnedAsset } from './snapOwnedAssets';
import type {
  InLockPeriodCaipAssetType,
  NativeCaipAssetType,
  NftCaipAssetType,
  ReadyForWithdrawalCaipAssetType,
  ResourceCaipAssetType,
  StakedCaipAssetType,
  StakingRewardsCaipAssetType,
  TokenCaipAssetType,
} from './types';

export class AssetsService {
  readonly #logger: ILogger;

  readonly #priceApiClient: PriceApiClient;

  readonly #tokenApiClient: TokenApiClient;

  readonly #snapClient: SnapClient;

  readonly #snapAdapter: SnapAssetsAdapter;

  readonly #assetsProvider: AssetsProvider;

  readonly cacheTtlsMilliseconds: {
    fiatExchangeRates: number;
    spotPrices: number;
    historicalPrices: number;
  };

  constructor({
    logger,
    assetsRepository,
    trongridApiClient,
    tronHttpClient,
    priceApiClient,
    tokenApiClient,
    snapClient,
    assetsProvider,
  }: {
    logger: ILogger;
    assetsRepository: AssetsRepository;
    trongridApiClient: TrongridApiClient;
    tronHttpClient: TronHttpClient;
    priceApiClient: PriceApiClient;
    tokenApiClient: TokenApiClient;
    snapClient: SnapClient;
    assetsProvider: AssetsProvider;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🪙 AssetsService]');
    this.#priceApiClient = priceApiClient;
    this.#tokenApiClient = tokenApiClient;
    this.#snapClient = snapClient;
    this.#assetsProvider = assetsProvider;
    this.#snapAdapter = new SnapAssetsAdapter({
      logger,
      assetsRepository,
      trongridApiClient,
      tronHttpClient,
    });

    const { cacheTtlsMilliseconds } = configProvider.get().priceApi;
    this.cacheTtlsMilliseconds = cacheTtlsMilliseconds;
  }

  async #getProviderAccountAssetByID(
    accountId: string,
    assetId: string,
  ): Promise<AssetEntity | null> {
    const asset = await this.#assetsProvider.getAccountAssetByID(
      accountId,
      assetId as Caip19AssetId,
    );

    if (!asset) {
      return null;
    }

    return mapControllerAsset(accountId, asset);
  }

  async #getProviderAccountAssetsByIDs(
    accountId: string,
    assetIds: string[],
  ): Promise<Record<string, AssetEntity | null>> {
    const controllerAssets = await this.#assetsProvider.getAccountAssetsByIDs(
      accountId,
      assetIds as Caip19AssetId[],
    );

    return Object.fromEntries(
      assetIds.map((assetId) => {
        const controllerAsset = controllerAssets[assetId as Caip19AssetId];
        return [
          assetId,
          controllerAsset
            ? mapControllerAsset(accountId, controllerAsset)
            : null,
        ];
      }),
    );
  }

  async #getProviderAccountAssetsByScope(
    scope: Network,
    accountId: string,
  ): Promise<AssetEntity[]> {
    const controllerAssets = await this.#assetsProvider.getAccountAssetsByScope(
      scope,
      accountId,
    );

    return Object.values(controllerAssets).map((asset) =>
      mapControllerAsset(accountId, asset),
    );
  }

  static isFiat(caipAssetId: CaipAssetType): boolean {
    return caipAssetId.includes('swift:0/iso4217:');
  }

  async getAccountAssetByID(
    accountId: string,
    assetId: string,
  ): Promise<AssetEntity | null> {
    if (isSnapOwnedAsset(assetId)) {
      return this.#snapAdapter.getAccountAssetByID(accountId, assetId);
    }

    return this.#getProviderAccountAssetByID(accountId, assetId);
  }

  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: string[],
  ): Promise<(AssetEntity | null)[]> {
    if (assetIds.length === 0) {
      return [];
    }

    const result: (AssetEntity | null)[] = new Array(assetIds.length).fill(
      null,
    );
    const fungibleIds: string[] = [];
    const fungibleIndices: number[] = [];

    for (const [index, assetId] of assetIds.entries()) {
      if (isSnapOwnedAsset(assetId)) {
        result[index] = await this.#snapAdapter.getAccountAssetByID(
          accountId,
          assetId,
        );
      } else {
        fungibleIds.push(assetId);
        fungibleIndices.push(index);
      }
    }

    if (fungibleIds.length === 0) {
      return result;
    }

    const fungibleResults = await this.#getProviderAccountAssetsByIDs(
      accountId,
      fungibleIds,
    );

    fungibleIds.forEach((assetId, fungibleIndex) => {
      const resultIndex = fungibleIndices[fungibleIndex];
      if (resultIndex !== undefined) {
        result[resultIndex] = fungibleResults[assetId] ?? null;
      }
    });

    return result;
  }

  async getAccountAssetsByScope(
    scope: Network,
    accountId: string,
  ): Promise<AssetEntity[]> {
    const snapAssets = await this.#snapAdapter.getAccountAssetsByScope(
      scope,
      accountId,
    );
    const snapOwnedAssets = snapAssets.filter((asset) =>
      isSnapOwnedAsset(asset.assetType),
    );
    const coreAssets = await this.#getProviderAccountAssetsByScope(
      scope,
      accountId,
    );

    return [
      ...coreAssets.filter((asset) => !isSnapOwnedAsset(asset.assetType)),
      ...snapOwnedAssets,
    ];
  }

  async getByKeyringAccountId(accountId: string): Promise<AssetEntity[]> {
    const assets = await this.#snapAdapter.getAccountAssetsByScope(
      Network.Mainnet,
      accountId,
    );

    return assets.filter((asset) => isSnapOwnedAsset(asset.assetType));
  }

  async syncSnapOwnedAssets(
    accounts: KeyringAccount[],
    scopes: Network[],
  ): Promise<void> {
    const combinations = accounts.flatMap((account) =>
      scopes.map((scope) => ({ account, scope })),
    );
    const responses = await Promise.allSettled(
      combinations.map(({ account, scope }) =>
        this.#snapAdapter.fetchSnapOwnedAssetsForAccount(scope, account),
      ),
    );
    const assets = responses.flatMap((response) =>
      response.status === 'fulfilled' ? response.value : [],
    );
    await this.#snapAdapter.saveMany(assets);
  }

  async getAssetsMetadata(
    assetTypes: CaipAssetType[],
  ): Promise<Record<CaipAssetType, AssetMetadata | null>> {
    this.#logger.info('Fetching metadata for assets', assetTypes);

    const {
      nativeAssetTypes,
      stakedNativeAssetTypes,
      readyForWithdrawalAssetTypes,
      inLockPeriodAssetTypes,
      stakingRewardsAssetTypes,
      energyAssetTypes,
      maximunEnergyAssetTypes,
      bandwidthAssetTypes,
      maximunBandwidthAssetTypes,
      tokenTrc10AssetTypes,
      tokenTrc20AssetTypes,
    } = this.#splitAssetsByType(assetTypes);

    const nativeTokensMetadata =
      this.#getNativeTokensMetadata(nativeAssetTypes);
    const stakedTokensMetadata = this.#getStakedTokensMetadata(
      stakedNativeAssetTypes,
    );
    const readyForWithdrawalTokensMetadata =
      this.#getReadyForWithdrawalTokensMetadata(readyForWithdrawalAssetTypes);
    const inLockPeriodTokensMetadata = this.#getInLockPeriodMetadata(
      inLockPeriodAssetTypes,
    );
    const stakingRewardsMetadata = this.#getStakingRewardsMetadata(
      stakingRewardsAssetTypes,
    );
    const energyTokensMetadata = this.#getEnergyMetadata(energyAssetTypes);
    const maximunEnergyTokensMetadata = this.#getMaximunEnergyMetadata(
      maximunEnergyAssetTypes,
    );
    const bandwidthTokensMetadata =
      this.#getBandwidthMetadata(bandwidthAssetTypes);
    const maximunBandwidthTokensMetadata = this.#getMaximunBandwidthMetadata(
      maximunBandwidthAssetTypes,
    );
    const tokensMetadata = await this.#getTokensMetadata([
      ...tokenTrc10AssetTypes,
      ...tokenTrc20AssetTypes,
    ]);

    const result = {
      ...nativeTokensMetadata,
      ...stakedTokensMetadata,
      ...readyForWithdrawalTokensMetadata,
      ...inLockPeriodTokensMetadata,
      ...stakingRewardsMetadata,
      ...energyTokensMetadata,
      ...maximunEnergyTokensMetadata,
      ...bandwidthTokensMetadata,
      ...maximunBandwidthTokensMetadata,
      ...tokensMetadata,
    };

    this.#logger.info('Resolved assets metadata', { assetTypes, result });

    return result;
  }

  #splitAssetsByType(assetTypes: CaipAssetType[]): {
    nativeAssetTypes: NativeCaipAssetType[];
    stakedNativeAssetTypes: StakedCaipAssetType[];
    readyForWithdrawalAssetTypes: ReadyForWithdrawalCaipAssetType[];
    inLockPeriodAssetTypes: InLockPeriodCaipAssetType[];
    stakingRewardsAssetTypes: StakingRewardsCaipAssetType[];
    energyAssetTypes: ResourceCaipAssetType[];
    maximunEnergyAssetTypes: ResourceCaipAssetType[];
    bandwidthAssetTypes: ResourceCaipAssetType[];
    maximunBandwidthAssetTypes: ResourceCaipAssetType[];
    tokenTrc10AssetTypes: TokenCaipAssetType[];
    tokenTrc20AssetTypes: TokenCaipAssetType[];
    nftAssetTypes: NftCaipAssetType[];
  } {
    const nativeAssetTypes = assetTypes.filter((assetType) =>
      assetType.endsWith('/slip44:195'),
    ) as NativeCaipAssetType[];
    const stakedNativeAssetTypes = assetTypes.filter((assetType) =>
      assetType.includes('/slip44:195-staked-for-'),
    ) as StakedCaipAssetType[];
    const readyForWithdrawalAssetTypes = assetTypes.filter((assetType) =>
      assetType.endsWith('/slip44:195-ready-for-withdrawal'),
    ) as ReadyForWithdrawalCaipAssetType[];
    const inLockPeriodAssetTypes = assetTypes.filter((assetType) =>
      assetType.endsWith('/slip44:195-in-lock-period'),
    ) as InLockPeriodCaipAssetType[];
    const stakingRewardsAssetTypes = assetTypes.filter((assetType) =>
      assetType.endsWith('/slip44:195-staking-rewards'),
    ) as StakingRewardsCaipAssetType[];
    const energyAssetTypes = assetTypes.filter((assetType) =>
      assetType.endsWith('/slip44:energy'),
    ) as ResourceCaipAssetType[];
    const maximunEnergyAssetTypes = assetTypes.filter((assetType) =>
      assetType.endsWith('/slip44:maximum-energy'),
    ) as ResourceCaipAssetType[];
    const bandwidthAssetTypes = assetTypes.filter((assetType) =>
      assetType.endsWith('/slip44:bandwidth'),
    ) as ResourceCaipAssetType[];
    const maximunBandwidthAssetTypes = assetTypes.filter((assetType) =>
      assetType.endsWith('/slip44:maximum-bandwidth'),
    ) as ResourceCaipAssetType[];
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
      stakedNativeAssetTypes,
      readyForWithdrawalAssetTypes,
      inLockPeriodAssetTypes,
      stakingRewardsAssetTypes,
      energyAssetTypes,
      maximunEnergyAssetTypes,
      bandwidthAssetTypes,
      maximunBandwidthAssetTypes,
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
      nativeTokensMetadata[assetType] = {
        fungible: TRX_METADATA.fungible,
        name: TRX_METADATA.name,
        symbol: TRX_METADATA.symbol,
        iconUrl: TRX_METADATA.iconUrl,
        units: [
          {
            decimals: TRX_METADATA.decimals,
            symbol: TRX_METADATA.symbol,
            name: TRX_METADATA.name,
          },
        ],
      };
    }

    return nativeTokensMetadata;
  }

  #getStakedTokensMetadata(
    assetTypes: StakedCaipAssetType[],
  ): Record<CaipAssetType, FungibleAssetMetadata | null> {
    // Can either be Staked for Bandwidth or Staked for Energy
    const stakedTokensMetadata: Record<
      CaipAssetType,
      FungibleAssetMetadata | null
    > = {};

    for (const assetType of assetTypes) {
      const isForBandwdidth = assetType.endsWith('staked-for-bandwidth');

      if (isForBandwdidth) {
        stakedTokensMetadata[assetType] = {
          fungible: TRX_STAKED_FOR_BANDWIDTH_METADATA.fungible,
          name: TRX_STAKED_FOR_BANDWIDTH_METADATA.name,
          symbol: TRX_STAKED_FOR_BANDWIDTH_METADATA.symbol,
          iconUrl: TRX_STAKED_FOR_BANDWIDTH_METADATA.iconUrl,
          units: [
            {
              decimals: TRX_STAKED_FOR_BANDWIDTH_METADATA.decimals,
              symbol: TRX_STAKED_FOR_BANDWIDTH_METADATA.symbol,
              name: TRX_STAKED_FOR_BANDWIDTH_METADATA.name,
            },
          ],
        };
      }

      const isForEnergy = assetType.endsWith('staked-for-energy');

      if (isForEnergy) {
        stakedTokensMetadata[assetType] = {
          fungible: TRX_STAKED_FOR_ENERGY_METADATA.fungible,
          name: TRX_STAKED_FOR_ENERGY_METADATA.name,
          symbol: TRX_STAKED_FOR_ENERGY_METADATA.symbol,
          iconUrl: TRX_STAKED_FOR_ENERGY_METADATA.iconUrl,
          units: [
            {
              decimals: TRX_STAKED_FOR_ENERGY_METADATA.decimals,
              symbol: TRX_STAKED_FOR_ENERGY_METADATA.symbol,
              name: TRX_STAKED_FOR_ENERGY_METADATA.name,
            },
          ],
        };
      }
    }

    return stakedTokensMetadata;
  }

  #getReadyForWithdrawalTokensMetadata(
    assetTypes: ReadyForWithdrawalCaipAssetType[],
  ): Record<CaipAssetType, FungibleAssetMetadata | null> {
    const readyForWithdrawalTokensMetadata: Record<
      CaipAssetType,
      FungibleAssetMetadata | null
    > = {};

    for (const assetType of assetTypes) {
      readyForWithdrawalTokensMetadata[assetType] = {
        fungible: TRX_READY_FOR_WITHDRAWAL_METADATA.fungible,
        name: TRX_READY_FOR_WITHDRAWAL_METADATA.name,
        symbol: TRX_READY_FOR_WITHDRAWAL_METADATA.symbol,
        iconUrl: TRX_READY_FOR_WITHDRAWAL_METADATA.iconUrl,
        units: [
          {
            decimals: TRX_READY_FOR_WITHDRAWAL_METADATA.decimals,
            symbol: TRX_READY_FOR_WITHDRAWAL_METADATA.symbol,
            name: TRX_READY_FOR_WITHDRAWAL_METADATA.name,
          },
        ],
      };
    }

    return readyForWithdrawalTokensMetadata;
  }

  #getStakingRewardsMetadata(
    assetTypes: StakingRewardsCaipAssetType[],
  ): Record<CaipAssetType, FungibleAssetMetadata | null> {
    const stakingRewardsMetadata: Record<
      CaipAssetType,
      FungibleAssetMetadata | null
    > = {};

    for (const assetType of assetTypes) {
      stakingRewardsMetadata[assetType] = {
        fungible: TRX_STAKING_REWARDS_METADATA.fungible,
        name: TRX_STAKING_REWARDS_METADATA.name,
        symbol: TRX_STAKING_REWARDS_METADATA.symbol,
        iconUrl: TRX_STAKING_REWARDS_METADATA.iconUrl,
        units: [
          {
            decimals: TRX_STAKING_REWARDS_METADATA.decimals,
            symbol: TRX_STAKING_REWARDS_METADATA.symbol,
            name: TRX_STAKING_REWARDS_METADATA.name,
          },
        ],
      };
    }

    return stakingRewardsMetadata;
  }

  #getInLockPeriodMetadata(
    assetTypes: InLockPeriodCaipAssetType[],
  ): Record<CaipAssetType, FungibleAssetMetadata | null> {
    const inLockPeriodTokensMetadata: Record<
      CaipAssetType,
      FungibleAssetMetadata | null
    > = {};

    for (const assetType of assetTypes) {
      inLockPeriodTokensMetadata[assetType] = {
        fungible: TRX_IN_LOCK_PERIOD_METADATA.fungible,
        name: TRX_IN_LOCK_PERIOD_METADATA.name,
        symbol: TRX_IN_LOCK_PERIOD_METADATA.symbol,
        iconUrl: TRX_IN_LOCK_PERIOD_METADATA.iconUrl,
        units: [
          {
            decimals: TRX_IN_LOCK_PERIOD_METADATA.decimals,
            symbol: TRX_IN_LOCK_PERIOD_METADATA.symbol,
            name: TRX_IN_LOCK_PERIOD_METADATA.name,
          },
        ],
      };
    }

    return inLockPeriodTokensMetadata;
  }

  #getBandwidthMetadata(
    assetTypes: ResourceCaipAssetType[],
  ): Record<CaipAssetType, FungibleAssetMetadata | null> {
    const bandwidthTokensMetadata: Record<
      CaipAssetType,
      FungibleAssetMetadata | null
    > = {};

    for (const assetType of assetTypes) {
      bandwidthTokensMetadata[assetType] = {
        fungible: BANDWIDTH_METADATA.fungible,
        name: BANDWIDTH_METADATA.name,
        symbol: BANDWIDTH_METADATA.symbol,
        iconUrl: BANDWIDTH_METADATA.iconUrl,
        units: [
          {
            decimals: BANDWIDTH_METADATA.decimals,
            symbol: BANDWIDTH_METADATA.symbol,
            name: BANDWIDTH_METADATA.name,
          },
        ],
      };
    }

    return bandwidthTokensMetadata;
  }

  #getMaximunBandwidthMetadata(
    assetTypes: ResourceCaipAssetType[],
  ): Record<CaipAssetType, FungibleAssetMetadata | null> {
    const maximunBandwidthTokensMetadata: Record<
      CaipAssetType,
      FungibleAssetMetadata | null
    > = {};

    for (const assetType of assetTypes) {
      maximunBandwidthTokensMetadata[assetType] = {
        fungible: MAX_BANDWIDTH_METADATA.fungible,
        name: MAX_BANDWIDTH_METADATA.name,
        symbol: MAX_BANDWIDTH_METADATA.symbol,
        iconUrl: MAX_BANDWIDTH_METADATA.iconUrl,
        units: [
          {
            decimals: MAX_BANDWIDTH_METADATA.decimals,
            symbol: MAX_BANDWIDTH_METADATA.symbol,
            name: MAX_BANDWIDTH_METADATA.name,
          },
        ],
      };
    }

    return maximunBandwidthTokensMetadata;
  }

  #getEnergyMetadata(
    assetTypes: ResourceCaipAssetType[],
  ): Record<CaipAssetType, FungibleAssetMetadata | null> {
    const energyTokensMetadata: Record<
      CaipAssetType,
      FungibleAssetMetadata | null
    > = {};

    for (const assetType of assetTypes) {
      energyTokensMetadata[assetType] = {
        fungible: ENERGY_METADATA.fungible,
        name: ENERGY_METADATA.name,
        symbol: ENERGY_METADATA.symbol,
        iconUrl: ENERGY_METADATA.iconUrl,
        units: [
          {
            decimals: ENERGY_METADATA.decimals,
            symbol: ENERGY_METADATA.symbol,
            name: ENERGY_METADATA.name,
          },
        ],
      };
    }

    return energyTokensMetadata;
  }

  #getMaximunEnergyMetadata(
    assetTypes: ResourceCaipAssetType[],
  ): Record<CaipAssetType, FungibleAssetMetadata | null> {
    const maximunEnergyTokensMetadata: Record<
      CaipAssetType,
      FungibleAssetMetadata | null
    > = {};

    for (const assetType of assetTypes) {
      maximunEnergyTokensMetadata[assetType] = {
        fungible: MAX_ENERGY_METADATA.fungible,
        name: MAX_ENERGY_METADATA.name,
        symbol: MAX_ENERGY_METADATA.symbol,
        iconUrl: MAX_ENERGY_METADATA.iconUrl,
        units: [
          {
            decimals: MAX_ENERGY_METADATA.decimals,
            symbol: MAX_ENERGY_METADATA.symbol,
            name: MAX_ENERGY_METADATA.name,
          },
        ],
      };
    }

    return maximunEnergyTokensMetadata;
  }

  async #getTokensMetadata(
    assetTypes: TokenCaipAssetType[],
  ): Promise<Record<TokenCaipAssetType, FungibleAssetMetadata | null>> {
    return this.#tokenApiClient.getTokensMetadata(assetTypes);
  }

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

  /**
   * Get historical prices for a token pair by calling the Price API.
   * Similar to the Solana snap implementation.
   *
   * @param from - The asset to get historical prices for.
   * @param to - The currency to convert prices to.
   * @returns Historical price data with intervals.
   */
  async getHistoricalPrice(
    from: CaipAssetType,
    to: CaipAssetType,
  ): Promise<{
    intervals: HistoricalPriceIntervals;
    updateTime: number;
    expirationTime?: number;
  }> {
    assert(from, CaipAssetTypeStruct);
    assert(to, CaipAssetTypeStruct);

    const toTicker = parseCaipAssetType(to).assetReference.toLowerCase();
    assert(toTicker, VsCurrencyParamStruct);

    const timePeriodsToFetch = ['1d', '7d', '1m', '3m', '1y', '1000y'];

    // For each time period, call the Price API to fetch the historical prices
    const promises = timePeriodsToFetch.map(async (timePeriod) =>
      this.#priceApiClient
        .getHistoricalPrices({
          assetType: from,
          timePeriod,
          vsCurrency: toTicker,
        })
        // Wrap the response in an object with the time period and the response for easier reducing
        .then((response) => ({
          timePeriod,
          response,
        }))
        // Gracefully handle individual errors to avoid breaking the entire operation
        .catch(async (error) => {
          await this.#snapClient.trackError(error as Error);
          this.#logger.warn(
            `Error fetching historical prices for ${from} to ${to} with time period ${timePeriod}. Returning null object.`,
            error,
          );
          return {
            timePeriod,
            response: GET_HISTORICAL_PRICES_RESPONSE_NULL_OBJECT,
          };
        }),
    );

    const wrappedHistoricalPrices = await Promise.all(promises);

    const intervals = wrappedHistoricalPrices.reduce<HistoricalPriceIntervals>(
      (acc, { timePeriod, response }) => {
        const iso8601Interval = `P${timePeriod.toUpperCase()}`;
        acc[iso8601Interval] = response.prices.map((price) => [
          price[0],
          price[1].toString(),
        ]);
        return acc;
      },
      {},
    );

    const now = Date.now();

    const result = {
      intervals,
      updateTime: now,
      expirationTime: now + this.cacheTtlsMilliseconds.historicalPrices,
    };

    return result;
  }
}
