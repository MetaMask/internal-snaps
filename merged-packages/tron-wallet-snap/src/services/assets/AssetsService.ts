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
  HistoricalPriceIntervals,
} from '@metamask/snaps-sdk';
import { assert } from '@metamask/superstruct';
import type { CaipAssetType } from '@metamask/utils';
import { CaipAssetTypeStruct, parseCaipAssetType } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { pick } from 'lodash';

import type { AssetsRepository } from './AssetsRepository';
import type {
  NativeCaipAssetType,
  NftCaipAssetType,
  ReadyForWithdrawalCaipAssetType,
  ResourceCaipAssetType,
  StakedCaipAssetType,
  TokenCaipAssetType,
} from './types';
import type { PriceApiClient } from '../../clients/price-api/PriceApiClient';
import type {
  FiatTicker,
  SpotPrice,
  SpotPrices,
} from '../../clients/price-api/types';
import {
  GET_HISTORICAL_PRICES_RESPONSE_NULL_OBJECT,
  VsCurrencyParamStruct,
} from '../../clients/price-api/types';
import type { TokenApiClient } from '../../clients/token-api/TokenApiClient';
import type { AccountResources } from '../../clients/tron-http';
import type { TronHttpClient } from '../../clients/tron-http/TronHttpClient';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import type {
  RawTronUnfrozenV2,
  Trc20Balance,
  TronAccount,
} from '../../clients/trongrid/types';
import type { KnownCaip19Id, Network } from '../../constants';
import {
  BANDWIDTH_METADATA,
  ENERGY_METADATA,
  ESSENTIAL_ASSETS,
  MAX_BANDWIDTH_METADATA,
  MAX_ENERGY_METADATA,
  Networks,
  TokenMetadata,
  TRX_METADATA,
  TRX_READY_FOR_WITHDRAWAL_METADATA,
  TRX_STAKED_FOR_BANDWIDTH_METADATA,
  TRX_STAKED_FOR_ENERGY_METADATA,
} from '../../constants';
import { configProvider } from '../../context';
import type { AssetEntity } from '../../entities/assets';
import { toUiAmount } from '../../utils/conversion';
import { createPrefixedLogger, type ILogger } from '../../utils/logger';
import type { State, UnencryptedStateValue } from '../state/State';

/**
 * Normalized account data structure that provides a consistent shape for both
 * active and inactive accounts. This allows extraction functions to work
 * without needing to know the account's activation state.
 */
type NormalizedAccountData = {
  /** Native TRX balance in sun (0 for inactive accounts). */
  nativeBalance: number;
  /** TRC10 token balances as `{ key: tokenId, value: balance }[]` (empty for inactive accounts). */
  trc10Balances: TronAccount['assetV2'];
  /** TRC20 token balances from either account info or fallback endpoint. */
  trc20Balances: Trc20Balance[];
  /** Staking data including frozen balances and delegated resources. */
  stakedData: {
    frozenV2: TronAccount['frozenV2'];
    unfrozenV2: TronAccount['unfrozenV2'];
    accountResource: TronAccount['account_resource'] | undefined;
  };
  /** Account resources (energy, bandwidth). Empty object for inactive accounts. */
  resources: AccountResources | Record<string, never>;
};

export class AssetsService {
  readonly #logger: ILogger;

  readonly #assetsRepository: AssetsRepository;

  readonly #state: State<UnencryptedStateValue>;

  readonly #trongridApiClient: TrongridApiClient;

  readonly #tronHttpClient: TronHttpClient;

  readonly #priceApiClient: PriceApiClient;

  readonly #tokenApiClient: TokenApiClient;

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
    tokenApiClient,
  }: {
    logger: ILogger;
    assetsRepository: AssetsRepository;
    state: State<UnencryptedStateValue>;
    trongridApiClient: TrongridApiClient;
    tronHttpClient: TronHttpClient;
    priceApiClient: PriceApiClient;
    tokenApiClient: TokenApiClient;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🪙 AssetsService]');
    this.#assetsRepository = assetsRepository;
    this.#state = state;
    this.#trongridApiClient = trongridApiClient;
    this.#tronHttpClient = tronHttpClient;
    this.#priceApiClient = priceApiClient;
    this.#tokenApiClient = tokenApiClient;

    const { cacheTtlsMilliseconds } = configProvider.get().priceApi;
    this.cacheTtlsMilliseconds = cacheTtlsMilliseconds;
  }

  static isFiat(caipAssetId: CaipAssetType): boolean {
    return caipAssetId.includes('swift:0/iso4217:');
  }

  async getAllAssetsByAccountId(accountId: string): Promise<AssetEntity[]> {
    return this.#assetsRepository.getByAccountId(accountId);
  }

  async getAssetsByAccountId(
    accountId: string,
    assetTypes: string[],
  ): Promise<(AssetEntity | null)[]> {
    return this.#assetsRepository.getByAccountIdAndAssetTypes(
      accountId,
      assetTypes,
    );
  }

  async getAssetByAccountId(
    accountId: string,
    assetType: string,
  ): Promise<AssetEntity | null> {
    return this.#assetsRepository.getByAccountIdAndAssetType(
      accountId,
      assetType,
    );
  }

  /**
   * Fetches all assets and balances for an account.
   *
   * Data Sources:
   * - `getAccountInfoByAddress`: TRX balance, TRC10 tokens, TRC20 tokens (active accounts only)
   * - `getAccountResources`: Energy and Bandwidth (returns {} for inactive accounts)
   * - `getTrc20BalancesByAddress`: TRC20 balances fallback (works for inactive accounts)
   *
   * Logic Flow:
   * 1. Fetch account info, resources, and TRC20 fallback (for inactive accounts)
   * 2. Normalize data into consistent shape via `#buildAccountData`
   * 3. Extract all assets via `#extractAssets`
   * 4. Fetch metadata and prices in parallel
   * 5. Enrich assets with metadata via `#enrichAssetsWithMetadata`
   * 6. Filter spam tokens via `#filterTokensWithoutPriceData`
   *
   * @param scope - The network to query.
   * @param account - The keyring account.
   * @returns Promise<AssetEntity[]> - Array of assets with balances.
   */
  async fetchAssetsAndBalancesForAccount(
    scope: Network,
    account: KeyringAccount,
  ): Promise<AssetEntity[]> {
    this.#logger.info('Fetching assets and balances by account', {
      account,
      scope,
    });

    const [tronAccountInfoRequest, tronAccountResourcesRequest] =
      await Promise.allSettled([
        this.#trongridApiClient.getAccountInfoByAddress(scope, account.address),
        this.#tronHttpClient.getAccountResources(scope, account.address),
      ]);

    const isInactiveAccount = tronAccountInfoRequest.status === 'rejected';
    if (isInactiveAccount) {
      this.#logger.info(
        'Account info request failed, treating as inactive account',
        { account, scope },
      );
    }

    const trc20BalancesFallback = isInactiveAccount
      ? await this.#trongridApiClient
          .getTrc20BalancesByAddress(scope, account.address)
          .catch((error) => {
            this.#logger.warn(
              'Failed to fetch TRC20 balances for inactive account',
              { error, account, scope },
            );
            return [];
          })
      : [];

    const accountData = this.#buildAccountData({
      tronAccountInfoRequest,
      tronAccountResourcesRequest,
      trc20BalancesFallback,
    });

    const rawAssets = this.#extractAssets(account, scope, accountData);

    const assetTypes = rawAssets.map((asset) => asset.assetType);
    const priceableAssetTypes = this.#getPriceableAssetTypes(rawAssets);

    const [assetsMetadata, spotPrices] = await Promise.all([
      this.getAssetsMetadata(assetTypes),
      this.#priceApiClient
        .getMultipleSpotPrices(priceableAssetTypes, 'usd')
        .catch(() => ({})),
    ]);

    const enrichedAssets = this.#enrichAssetsWithMetadata(
      rawAssets,
      assetsMetadata,
    );
    return this.#filterTokensWithoutPriceData(enrichedAssets, spotPrices);
  }

  /**
   * Filters out spam tokens (those without price data).
   * Essential assets are always kept. Tokens need price data to be included.
   *
   * @param assets - The assets to filter.
   * @param spotPrices - Pre-fetched USD prices for assets.
   * @returns The filtered assets.
   */
  #filterTokensWithoutPriceData(
    assets: AssetEntity[],
    spotPrices: SpotPrices | Record<string, never>,
  ): AssetEntity[] {
    const filtered = assets.filter((asset) => {
      // Essential assets (TRX, staked, energy, bandwidth) are always kept
      if (ESSENTIAL_ASSETS.includes(asset.assetType)) {
        return true;
      }
      // Tokens: keep only if they have price data
      const spotPrice = (spotPrices as SpotPrices)[asset.assetType];
      return typeof spotPrice?.price === 'number';
    });

    return filtered;
  }

  /**
   * Normalizes raw API responses into a consistent shape for both active and inactive accounts.
   * This allows extraction functions to work without needing to know the account's activation state.
   *
   * @param params - The raw API responses to normalize.
   * @param params.tronAccountInfoRequest - The settled promise result from getAccountInfoByAddress.
   * @param params.tronAccountResourcesRequest - The settled promise result from getAccountResources.
   * @param params.trc20BalancesFallback - TRC20 balances from fallback endpoint (empty for active accounts).
   * @returns NormalizedAccountData - Consistent data shape for extraction.
   */
  #buildAccountData({
    tronAccountInfoRequest,
    tronAccountResourcesRequest,
    trc20BalancesFallback,
  }: {
    tronAccountInfoRequest: PromiseSettledResult<TronAccount>;
    tronAccountResourcesRequest: PromiseSettledResult<AccountResources>;
    trc20BalancesFallback: Trc20Balance[];
  }): NormalizedAccountData {
    const isInactiveAccount = tronAccountInfoRequest.status === 'rejected';
    const resources =
      tronAccountResourcesRequest.status === 'fulfilled'
        ? tronAccountResourcesRequest.value
        : {};

    if (isInactiveAccount) {
      return {
        nativeBalance: 0,
        trc10Balances: [],
        trc20Balances: trc20BalancesFallback,
        stakedData: {
          frozenV2: [],
          unfrozenV2: [],
          accountResource: undefined,
        },
        resources,
      };
    }

    const tronAccountInfo = tronAccountInfoRequest.value;
    return {
      nativeBalance: tronAccountInfo.balance ?? 0,
      trc10Balances: tronAccountInfo.assetV2 ?? [],
      trc20Balances: tronAccountInfo.trc20 ?? [],
      stakedData: {
        frozenV2: tronAccountInfo.frozenV2 ?? [],
        unfrozenV2: tronAccountInfo.unfrozenV2 ?? [],
        accountResource: tronAccountInfo.account_resource,
      },
      resources,
    };
  }

  /**
   * Extracts all assets from normalized account data.
   * Coordinates calls to individual extraction functions.
   *
   * @param account - The keyring account.
   * @param scope - The network.
   * @param data - Normalized account data.
   * @returns AssetEntity[] - Array of all extracted assets.
   */
  #extractAssets(
    account: KeyringAccount,
    scope: Network,
    data: NormalizedAccountData,
  ): AssetEntity[] {
    return [
      this.#extractNativeAsset(account, scope, data.nativeBalance),
      ...this.#extractStakedNativeAssets(account, scope, data.stakedData),
      ...this.#extractReadyForWithdrawalAssets(account, scope, data.stakedData),
      ...this.#extractTrc10Assets(account, scope, data.trc10Balances),
      ...this.#extractTrc20Assets(account, scope, data.trc20Balances),
      ...this.#extractBandwidth({
        account,
        scope,
        tronAccountResources: data.resources,
      }),
      ...this.#extractEnergy({
        account,
        scope,
        tronAccountResources: data.resources,
      }),
    ];
  }

  /**
   * Returns the asset types that can be priced (native, TRC10, TRC20).
   * Staked, energy, and bandwidth assets have non-compliant CAIP IDs that would fail the Price API.
   *
   * @param assets - Array of assets to filter.
   * @returns CaipAssetType[] - Array of priceable asset types.
   */
  #getPriceableAssetTypes(assets: AssetEntity[]): CaipAssetType[] {
    return assets
      .filter(
        (asset) =>
          asset.assetType.includes('/slip44:') ||
          asset.assetType.includes('/trc10:') ||
          asset.assetType.includes('/trc20:'),
      )
      .map((asset) => asset.assetType);
  }

  /**
   * Enriches assets with metadata (symbol, decimals, iconUrl) and calculates uiAmount.
   *
   * @param assets - Raw assets to enrich.
   * @param assetsMetadata - Metadata lookup by asset type.
   * @returns AssetEntity[] - Enriched assets.
   */
  #enrichAssetsWithMetadata(
    assets: AssetEntity[],
    assetsMetadata: Record<CaipAssetType, AssetMetadata | null>,
  ): AssetEntity[] {
    return assets.map((asset) => {
      const metadata = assetsMetadata[
        asset.assetType
      ] as FungibleAssetMetadata | null;

      const {
        symbol: initialSymbol,
        decimals: initialDecimals = 0,
        iconUrl: initialIconUrl,
      } = asset;
      let symbol = initialSymbol;
      let decimals = initialDecimals;
      let iconUrl = initialIconUrl;

      if (metadata?.fungible) {
        const unit = metadata.units?.[0];
        if (unit) {
          symbol = unit.symbol ?? metadata.symbol ?? symbol;
          decimals = unit.decimals ?? decimals;
        } else {
          symbol = metadata?.symbol ?? symbol;
        }
        iconUrl = metadata.iconUrl ?? iconUrl;
      }

      const uiAmount = toUiAmount(asset.rawAmount, decimals).toString();

      return {
        ...asset,
        symbol,
        decimals,
        uiAmount,
        iconUrl,
      };
    });
  }

  /**
   * Extracts the native TRX asset from the balance.
   *
   * @param account - The keyring account.
   * @param scope - The network.
   * @param balance - The native balance in sun.
   * @returns AssetEntity - The native TRX asset.
   */
  #extractNativeAsset(
    account: KeyringAccount,
    scope: Network,
    balance: number,
  ): AssetEntity {
    return {
      assetType: Networks[scope].nativeToken.id,
      keyringAccountId: account.id,
      network: scope,
      symbol: Networks[scope].nativeToken.symbol,
      decimals: Networks[scope].nativeToken.decimals,
      rawAmount: balance.toString(),
      uiAmount: toUiAmount(
        balance,
        Networks[scope].nativeToken.decimals,
      ).toString(),
      iconUrl: Networks[scope].nativeToken.iconUrl,
    };
  }

  /**
   * Extracts staked TRX assets (for bandwidth and energy).
   *
   * @param account - The keyring account.
   * @param scope - The network.
   * @param stakedData - Staking data including frozen balances and delegated resources.
   * @returns AssetEntity[] - Array of staked assets (may be empty if no staking).
   */
  #extractStakedNativeAssets(
    account: KeyringAccount,
    scope: Network,
    stakedData: NormalizedAccountData['stakedData'],
  ): AssetEntity[] {
    const assets: AssetEntity[] = [];

    let stakedBandwidthAmount = 0;
    let stakedEnergyAmount = 0;

    stakedData.frozenV2?.forEach((frozen) => {
      const amount = frozen.amount ?? 0;

      if (frozen.type === 'ENERGY') {
        stakedEnergyAmount += amount;
      } else if (!frozen.type) {
        // Item without type is for bandwidth
        stakedBandwidthAmount += amount;
      }
    });

    const delegatedBandwidth =
      stakedData.accountResource?.delegated_frozenV2_balance_for_bandwidth ?? 0;
    const delegatedEnergy =
      stakedData.accountResource?.delegated_frozenV2_balance_for_energy ?? 0;

    stakedBandwidthAmount += delegatedBandwidth;
    stakedEnergyAmount += delegatedEnergy;

    if (stakedBandwidthAmount > 0) {
      const stakedBandwidthAsset: AssetEntity = {
        assetType: Networks[scope].stakedForBandwidth.id,
        keyringAccountId: account.id,
        network: scope,
        symbol: Networks[scope].stakedForBandwidth.symbol,
        decimals: Networks[scope].stakedForBandwidth.decimals,
        rawAmount: stakedBandwidthAmount.toString(),
        uiAmount: toUiAmount(
          stakedBandwidthAmount,
          Networks[scope].stakedForBandwidth.decimals,
        ).toString(),
        iconUrl: Networks[scope].stakedForBandwidth.iconUrl,
      };
      assets.push(stakedBandwidthAsset);
    }

    if (stakedEnergyAmount > 0) {
      const stakedEnergyAsset: AssetEntity = {
        assetType: Networks[scope].stakedForEnergy.id,
        keyringAccountId: account.id,
        network: scope,
        symbol: Networks[scope].stakedForEnergy.symbol,
        decimals: Networks[scope].stakedForEnergy.decimals,
        rawAmount: stakedEnergyAmount.toString(),
        uiAmount: toUiAmount(
          stakedEnergyAmount,
          Networks[scope].stakedForEnergy.decimals,
        ).toString(),
        iconUrl: Networks[scope].stakedForEnergy.iconUrl,
      };
      assets.push(stakedEnergyAsset);
    }

    return assets;
  }

  /**
   * Extracts TRX ready for withdrawal (unstaked TRX that has completed the withdrawal period).
   *
   * @param account - The keyring account.
   * @param scope - The network.
   * @param stakedData - Staking data including unfrozen balances.
   * @returns AssetEntity[] - Array with ready-for-withdrawal asset (may be empty if none available).
   */
  #extractReadyForWithdrawalAssets(
    account: KeyringAccount,
    scope: Network,
    stakedData: NormalizedAccountData['stakedData'],
  ): AssetEntity[] {
    const currentTimestamp = Date.now();
    let readyForWithdrawalAmount = 0;

    stakedData.unfrozenV2?.forEach((unfrozen: RawTronUnfrozenV2) => {
      const expireTime = unfrozen.unfreeze_expire_time ?? 0;
      const amount = unfrozen.unfreeze_amount ?? 0;

      if (expireTime <= currentTimestamp && amount > 0) {
        readyForWithdrawalAmount += amount;
      }
    });

    if (readyForWithdrawalAmount > 0) {
      const { id, symbol, decimals, iconUrl } =
        Networks[scope].readyForWithdrawal;

      const readyForWithdrawalAsset: AssetEntity = {
        assetType: id,
        keyringAccountId: account.id,
        network: scope,
        symbol,
        decimals,
        rawAmount: readyForWithdrawalAmount.toString(),
        uiAmount: toUiAmount(readyForWithdrawalAmount, decimals).toString(),
        iconUrl,
      };
      return [readyForWithdrawalAsset];
    }

    return [];
  }

  /**
   * Extracts current and maximum bandwidth from the account resources.
   *
   * @param options - Options object.
   * @param options.account - The account to extract bandwidth for.
   * @param options.scope - The network to extract bandwidth for.
   * @param options.tronAccountResources - The account resources to extract bandwidth for.
   * @returns The bandwidth assets.
   */
  #extractBandwidth({
    account,
    scope,
    tronAccountResources,
  }: {
    account: KeyringAccount;
    scope: Network;
    tronAccountResources: AccountResources | Record<string, never>;
  }): AssetEntity[] {
    const freeBandwidth = tronAccountResources?.freeNetLimit ?? 0;
    const stakingBandwidth = tronAccountResources?.NetLimit ?? 0;
    const maximumBandwidth = freeBandwidth + stakingBandwidth;

    const usedFreeBandwidth = tronAccountResources?.freeNetUsed ?? 0;
    const usedStakingBandwidth = tronAccountResources?.NetUsed ?? 0;
    const usedBandwidth = usedFreeBandwidth + usedStakingBandwidth;

    const availableBandwidth = Math.max(0, maximumBandwidth - usedBandwidth);

    return [
      {
        assetType: Networks[scope].bandwidth.id,
        keyringAccountId: account.id,
        network: scope,
        symbol: Networks[scope].bandwidth.symbol,
        decimals: Networks[scope].bandwidth.decimals,
        rawAmount: availableBandwidth.toString(),
        uiAmount: availableBandwidth.toString(),
        iconUrl: Networks[scope].bandwidth.iconUrl,
      },
      {
        assetType: Networks[scope].maximumBandwidth.id,
        keyringAccountId: account.id,
        network: scope,
        symbol: Networks[scope].maximumBandwidth.symbol,
        decimals: Networks[scope].maximumBandwidth.decimals,
        rawAmount: maximumBandwidth.toString(),
        uiAmount: maximumBandwidth.toString(),
        iconUrl: Networks[scope].maximumBandwidth.iconUrl,
      },
    ];
  }

  /**
   * Extracts current and maximum energy from the account resources.
   *
   * @param options - Options object.
   * @param options.account - The keyring account.
   * @param options.scope - The network.
   * @param options.tronAccountResources - Account resources (energy, bandwidth).
   * @returns AssetEntity[] - Array containing energy and maximum energy assets.
   */
  #extractEnergy({
    account,
    scope,
    tronAccountResources,
  }: {
    account: KeyringAccount;
    scope: Network;
    tronAccountResources: AccountResources | Record<string, never>;
  }): AssetEntity[] {
    const maximumEnergy = tronAccountResources?.EnergyLimit ?? 0;
    const usedEnergy = tronAccountResources?.EnergyUsed ?? 0;

    /**
     * We might have used more Energy than the maximum allocated
     */
    const availableEnergy = Math.max(0, maximumEnergy - usedEnergy);

    return [
      {
        assetType: Networks[scope].energy.id,
        keyringAccountId: account.id,
        network: scope,
        symbol: Networks[scope].energy.symbol,
        decimals: Networks[scope].energy.decimals,
        rawAmount: availableEnergy.toString(),
        uiAmount: availableEnergy.toString(),
        iconUrl: Networks[scope].energy.iconUrl,
      },
      {
        assetType: Networks[scope].maximumEnergy.id,
        keyringAccountId: account.id,
        network: scope,
        symbol: Networks[scope].maximumEnergy.symbol,
        decimals: Networks[scope].maximumEnergy.decimals,
        rawAmount: maximumEnergy.toString(),
        uiAmount: maximumEnergy.toString(),
        iconUrl: Networks[scope].maximumEnergy.iconUrl,
      },
    ];
  }

  /**
   * Extracts TRC10 assets from the balances array.
   *
   * @param account - The keyring account.
   * @param scope - The network.
   * @param trc10Balances - TRC10 token balances as `{ key: tokenId, value: balance }[]`.
   * @returns AssetEntity[] - Array of TRC10 asset entities.
   */
  #extractTrc10Assets(
    account: KeyringAccount,
    scope: Network,
    trc10Balances: TronAccount['assetV2'],
  ): AssetEntity[] {
    return (
      trc10Balances?.flatMap((tokenObject) => {
        // assetV2 has structure: { "key": "token_id", "value": "balance" }
        return {
          assetType: `${scope}/trc10:${tokenObject.key}` as TokenCaipAssetType,
          keyringAccountId: account.id,
          network: scope,
          symbol: '',
          decimals: 0,
          rawAmount: tokenObject.value?.toString() ?? '0',
          uiAmount: '0',
          iconUrl: '', // Will be enriched with metadata later
        };
      }) ?? []
    );
  }

  /**
   * Extracts TRC20 assets from a balances array.
   * Works with both active accounts (tronAccountInfo.trc20) and inactive accounts (getTrc20BalancesByAddress).
   *
   * @param account - The keyring account.
   * @param scope - The network.
   * @param trc20Balances - Array of `Record<contractAddress, balance>` objects (e.g., `[{ "TContractAddr": "1000" }]`).
   * @returns AssetEntity[] - Array of TRC20 asset entities.
   */
  #extractTrc20Assets(
    account: KeyringAccount,
    scope: Network,
    trc20Balances: Trc20Balance[],
  ): AssetEntity[] {
    return trc20Balances.flatMap((tokenObject) => {
      return Object.entries(tokenObject).map(([address, balance]) => {
        return {
          assetType: `${scope}/trc20:${address}` as TokenCaipAssetType,
          keyringAccountId: account.id,
          network: scope,
          symbol: '',
          decimals: 0,
          rawAmount: balance,
          uiAmount: '0',
          iconUrl: '', // Will be enriched with metadata later
        };
      });
    });
  }

  async getAssetsMetadata(
    assetTypes: CaipAssetType[],
  ): Promise<Record<CaipAssetType, AssetMetadata | null>> {
    this.#logger.info('Fetching metadata for assets', assetTypes);

    const {
      nativeAssetTypes,
      stakedNativeAssetTypes,
      readyForWithdrawalAssetTypes,
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

    /**
     * Should we save the assets incrementally?
     * - If true, only saves and emits events for the assets that have changed (new or balance changed). Better performance because it only informs the client of what has changed.
     * - If false, saves all assets. More reliable because it enforces that the client has the same state of assets as the snap.
     */
    const isIncremental = false;

    const hasZeroAmount = (asset: AssetEntity): boolean =>
      asset.rawAmount === '0' || asset.uiAmount === '0';

    const hasNonZeroAmount = (asset: AssetEntity): boolean =>
      !hasZeroAmount(asset);

    const savedAssets = await this.getAll();

    // Save assets using repository
    await this.#assetsRepository.saveMany(assets);

    // Notify the extension about the new assets in a single event
    const isNew = (asset: AssetEntity): boolean =>
      !savedAssets.find(
        (item) =>
          item.keyringAccountId === asset.keyringAccountId &&
          item.assetType === asset.assetType,
      );

    const wasSavedWithZeroAmount = (asset: AssetEntity): boolean => {
      const savedAsset = savedAssets.find(
        (item) =>
          item.keyringAccountId === asset.keyringAccountId &&
          item.assetType === asset.assetType,
      );

      return Boolean(savedAsset && hasZeroAmount(savedAsset));
    };

    const isEssentialAsset = (asset: AssetEntity): boolean =>
      ESSENTIAL_ASSETS.includes(asset.assetType);

    const shouldBeInRemovedList = (asset: AssetEntity): boolean =>
      hasZeroAmount(asset) && !isEssentialAsset(asset); // Never remove essential assets (including energy & bandwidth) from the account asset list

    const shouldBeInAddedList = (asset: AssetEntity): boolean =>
      !shouldBeInRemovedList(asset) &&
      (!isIncremental ||
        ((isNew(asset) || wasSavedWithZeroAmount(asset)) &&
          hasNonZeroAmount(asset)));

    const assetListUpdatedPayload = assets.reduce<
      AccountAssetListUpdatedEvent['params']['assets']
    >(
      (acc, asset) => ({
        ...acc,
        [asset.keyringAccountId]: {
          added: [
            ...(acc[asset.keyringAccountId]?.added ?? []),
            ...(shouldBeInAddedList(asset) ? [asset.assetType] : []),
          ],
          removed: [
            ...(acc[asset.keyringAccountId]?.removed ?? []),
            ...(shouldBeInRemovedList(asset) ? [asset.assetType] : []),
          ],
        },
      }),
      {},
    );

    // If no assets were added or removed, don't emit the event.
    const isEmptyAccountAssetListUpdatedPayload = Object.values(
      assetListUpdatedPayload,
    )
      .map((item) => item.added.length + item.removed.length)
      .every((item) => item === 0);

    if (!isEmptyAccountAssetListUpdatedPayload) {
      await emitSnapKeyringEvent(snap, KeyringEvent.AccountAssetListUpdated, {
        assets: assetListUpdatedPayload,
      });
    }

    // Notify the extension about the changed balances in a single event
    const hasChanged = (asset: AssetEntity): boolean =>
      AssetsService.hasChanged(asset, savedAssets);

    const balancesUpdatedPayload = assets
      .filter(isIncremental ? hasChanged : (): boolean => true)
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

    // Traverse the balancesUpdatedPayload object to check if we have at least 1 account that has at least 1 balance updated.
    const isSomeBalanceChanged = Object.values(balancesUpdatedPayload)
      .map((accountAssets) => Object.keys(accountAssets).length) // To each accountAssets object, map the number of assetTypes
      .some((count) => count > 0);

    // Only emit the event if some balance was changed.
    if (isSomeBalanceChanged) {
      await emitSnapKeyringEvent(snap, KeyringEvent.AccountBalancesUpdated, {
        balances: balancesUpdatedPayload,
      });
    }
  }

  async getAll(): Promise<AssetEntity[]> {
    const assetsByAccount =
      (await this.#state.getKey<UnencryptedStateValue['assets']>('assets')) ??
      {};

    return Object.values(assetsByAccount).flat();
  }

  /**
   * Creates an asset entity with zero balance from a known CAIP-19 asset ID.
   * Uses pre-calculated metadata from TokenMetadata.
   *
   * @param assetId - The CAIP-19 asset ID (e.g., KnownCaip19Id.TrxMainnet).
   * @param keyringAccountId - The keyring account ID.
   * @returns The asset entity with zero balance.
   */
  #createZeroBalanceAsset(
    assetId: KnownCaip19Id,
    keyringAccountId: string,
  ): AssetEntity {
    const metadata = TokenMetadata[assetId as keyof typeof TokenMetadata];
    const { chainId } = parseCaipAssetType(assetId);

    return {
      assetType: metadata.id,
      keyringAccountId,
      network: chainId as Network,
      symbol: metadata.symbol,
      decimals: metadata.decimals,
      rawAmount: '0',
      uiAmount: '0',
    } as AssetEntity;
  }

  async getByKeyringAccountId(
    keyringAccountId: string,
  ): Promise<AssetEntity[]> {
    const savedAssets =
      await this.#assetsRepository.getByAccountId(keyringAccountId);

    /**
     * Ensure the special assets are always present whether they have been synced or not.
     * These are assets that should be visible to the user even with zero balance.
     */
    const missingEssentialAssets: AssetEntity[] = [];

    for (const essentialAssetId of ESSENTIAL_ASSETS) {
      const savedAsset = savedAssets.find(
        (asset) => (asset.assetType as string) === essentialAssetId,
      );

      if (!savedAsset) {
        const zeroBalanceAsset = this.#createZeroBalanceAsset(
          essentialAssetId as KnownCaip19Id,
          keyringAccountId,
        );
        missingEssentialAssets.push(zeroBalanceAsset);
      }
    }

    return [...savedAssets, ...missingEssentialAssets];
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
        .catch((error) => {
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
