import type { Asset, Caip19AssetId } from '@metamask/assets-controller';
import { KeyringEvent } from '@metamask/keyring-api';
import type {
  AccountAssetListUpdatedEvent,
  AccountBalancesUpdatedEvent,
  KeyringAccount,
} from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
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

import type { PriceApiClient } from '../../clients/price-api/PriceApiClient';
import type { FiatTicker, SpotPrice } from '../../clients/price-api/types';
import {
  GET_HISTORICAL_PRICES_RESPONSE_NULL_OBJECT,
  VsCurrencyParamStruct,
} from '../../clients/price-api/types';
import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TokenApiClient } from '../../clients/token-api/TokenApiClient';
import type { AccountResources } from '../../clients/tron-http';
import type { TronHttpClient } from '../../clients/tron-http/TronHttpClient';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import type {
  RawTronUnfrozenV2,
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
  TRX_IN_LOCK_PERIOD_METADATA,
  TRX_METADATA,
  TRX_READY_FOR_WITHDRAWAL_METADATA,
  TRX_STAKED_FOR_BANDWIDTH_METADATA,
  TRX_STAKED_FOR_ENERGY_METADATA,
  TRX_STAKING_REWARDS_METADATA,
} from '../../constants';
import { configProvider } from '../../context';
import type { AssetEntity } from '../../entities/assets';
import type { CoreMessengerCaller } from '../../types/core-messenger';
import { toUiAmount } from '../../utils/conversion';
import { createPrefixedLogger } from '../../utils/logger';
import type { ILogger } from '../../utils/logger';
import type { State, UnencryptedStateValue } from '../state/State';
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

/**
 * Slim account data shape for snap-owned asset extraction.
 * Provides a consistent shape for both active and inactive accounts.
 */
type SnapOwnedAccountData = {
  /** Staking data including frozen balances and delegated resources. */
  stakedData: {
    frozenV2: TronAccount['frozenV2'];
    unfrozenV2: TronAccount['unfrozenV2'];
    accountResource: TronAccount['account_resource'] | undefined;
  };
  /** Account resources (energy, bandwidth). Empty object for inactive accounts. */
  resources: AccountResources | Record<string, never>;
  /** Unclaimed staking rewards in sun (0 if no rewards). */
  stakingRewards: number;
};

export class AssetsService {
  readonly #logger: ILogger;

  readonly #assetsRepository: AssetsRepository;

  readonly #state: State<UnencryptedStateValue>;

  readonly #trongridApiClient: TrongridApiClient;

  readonly #tronHttpClient: TronHttpClient;

  readonly #priceApiClient: PriceApiClient;

  readonly #tokenApiClient: TokenApiClient;

  readonly #snapClient: SnapClient;

  readonly #coreMessenger: CoreMessengerCaller;

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
    snapClient,
    coreMessenger,
  }: {
    logger: ILogger;
    assetsRepository: AssetsRepository;
    state: State<UnencryptedStateValue>;
    trongridApiClient: TrongridApiClient;
    tronHttpClient: TronHttpClient;
    priceApiClient: PriceApiClient;
    tokenApiClient: TokenApiClient;
    snapClient: SnapClient;
    coreMessenger: CoreMessengerCaller;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🪙 AssetsService]');
    this.#assetsRepository = assetsRepository;
    this.#state = state;
    this.#trongridApiClient = trongridApiClient;
    this.#tronHttpClient = tronHttpClient;
    this.#priceApiClient = priceApiClient;
    this.#tokenApiClient = tokenApiClient;
    this.#snapClient = snapClient;
    this.#coreMessenger = coreMessenger;

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
    const snapOwnedTypes = assetTypes.filter(isSnapOwnedAsset);
    const controllerTypes = assetTypes.filter(
      (type) => !isSnapOwnedAsset(type),
    );

    const snapOwnedByType = new Map<string, AssetEntity | null>();
    if (snapOwnedTypes.length > 0) {
      const snapOwnedResults =
        await this.#assetsRepository.getByAccountIdAndAssetTypes(
          accountId,
          snapOwnedTypes,
        );
      snapOwnedTypes.forEach((assetType, index) => {
        snapOwnedByType.set(assetType, snapOwnedResults[index] ?? null);
      });
    }

    const controllerByType = new Map<string, AssetEntity | null>();
    if (controllerTypes.length > 0) {
      const chainIds = [
        ...new Set(
          controllerTypes.map(
            (assetType) =>
              parseCaipAssetType(assetType as CaipAssetType).chainId,
          ),
        ),
      ];

      const controllerAssets = await this.#coreMessenger.call(
        'AssetsController:getAssets',
        [{ id: accountId }] as unknown as InternalAccount[],
        { chainIds },
      );

      const accountAssets =
        (controllerAssets as Record<string, Record<string, Asset>>)[
          accountId
        ] ?? {};

      for (const assetType of controllerTypes) {
        const controllerAsset = accountAssets[assetType];
        controllerByType.set(
          assetType,
          controllerAsset
            ? mapControllerAsset(accountId, assetType, controllerAsset)
            : null,
        );
      }
    }

    return assetTypes.map(
      (assetType) =>
        snapOwnedByType.get(assetType) ??
        controllerByType.get(assetType) ??
        null,
    );
  }

  async getAssetByAccountId(
    accountId: string,
    assetType: string,
  ): Promise<AssetEntity | null> {
    if (isSnapOwnedAsset(assetType)) {
      return this.#assetsRepository.getByAccountIdAndAssetType(
        accountId,
        assetType,
      );
    }

    const result = await this.#coreMessenger.call(
      'AssetsController:getAsset',
      accountId,
      assetType as Caip19AssetId,
    );

    if (!result) {
      return null;
    }

    return mapControllerAsset(accountId, assetType, result);
  }

  /**
   * Fetches snap-owned assets and balances for an account.
   *
   * Data Sources:
   * - `getAccountInfoByAddress`: Staking data (active accounts only)
   * - `getAccountResources`: Energy and Bandwidth (returns {} for inactive accounts)
   * - `getReward`: Unclaimed staking rewards
   *
   * @param scope - The network to query.
   * @param account - The keyring account.
   * @returns Promise<AssetEntity[]> - Array of snap-owned assets with balances.
   */
  async fetchAssetsAndBalancesForAccount(
    scope: Network,
    account: KeyringAccount,
  ): Promise<AssetEntity[]> {
    this.#logger.info('Fetching snap-owned assets and balances by account', {
      account,
      scope,
    });

    const [
      tronAccountInfoRequest,
      tronAccountResourcesRequest,
      stakingRewardsRequest,
    ] = await Promise.allSettled([
      this.#trongridApiClient.getAccountInfoByAddress(scope, account.address),
      this.#tronHttpClient.getAccountResources(scope, account.address),
      this.#tronHttpClient.getReward(scope, account.address),
    ]);

    if (tronAccountInfoRequest.status === 'rejected') {
      this.#logger.info(
        'Account info request failed, treating as inactive account',
        { account, scope },
      );
    }

    const accountData = this.#buildSnapOwnedAccountData({
      tronAccountInfoRequest,
      tronAccountResourcesRequest,
      stakingRewardsRequest,
    });

    return this.#extractSnapOwnedAssets(account, scope, accountData);
  }

  /**
   * Normalizes raw API responses into a slim shape for snap-owned asset extraction.
   *
   * @param params - The raw API responses to normalize.
   * @param params.tronAccountInfoRequest - The settled promise result from getAccountInfoByAddress.
   * @param params.tronAccountResourcesRequest - The settled promise result from getAccountResources.
   * @param params.stakingRewardsRequest - The settled promise result from getReward.
   * @returns SnapOwnedAccountData - Consistent data shape for snap-owned extraction.
   */
  #buildSnapOwnedAccountData({
    tronAccountInfoRequest,
    tronAccountResourcesRequest,
    stakingRewardsRequest,
  }: {
    tronAccountInfoRequest: PromiseSettledResult<TronAccount>;
    tronAccountResourcesRequest: PromiseSettledResult<AccountResources>;
    stakingRewardsRequest: PromiseSettledResult<number>;
  }): SnapOwnedAccountData {
    const isInactiveAccount = tronAccountInfoRequest.status === 'rejected';
    const resources =
      tronAccountResourcesRequest.status === 'fulfilled'
        ? tronAccountResourcesRequest.value
        : {};
    const stakingRewards =
      stakingRewardsRequest.status === 'fulfilled'
        ? Math.max(0, stakingRewardsRequest.value)
        : 0;

    if (isInactiveAccount) {
      return {
        stakedData: {
          frozenV2: [],
          unfrozenV2: [],
          accountResource: undefined,
        },
        resources,
        stakingRewards,
      };
    }

    const tronAccountInfo = tronAccountInfoRequest.value;
    return {
      stakedData: {
        frozenV2: tronAccountInfo.frozenV2 ?? [],
        unfrozenV2: tronAccountInfo.unfrozenV2 ?? [],
        accountResource: tronAccountInfo.account_resource,
      },
      resources,
      stakingRewards,
    };
  }

  #extractSnapOwnedAssets(
    account: KeyringAccount,
    scope: Network,
    data: SnapOwnedAccountData,
  ): AssetEntity[] {
    return [
      ...this.#extractStakedNativeAssets(account, scope, data.stakedData),
      this.#extractReadyForWithdrawalAsset(account, scope, data.stakedData),
      this.#extractInLockPeriodAsset(account, scope, data.stakedData),
      this.#extractStakingRewardsAsset(account, scope, data.stakingRewards),
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
   * Extracts staked TRX assets (for bandwidth and energy).
   *
   * @param account - The keyring account.
   * @param scope - The network.
   * @param stakedData - Staking data including frozen balances and delegated resources.
   * @returns AssetEntity[] - Array of staked assets (always 2: bandwidth and energy, amounts may be 0).
   */
  #extractStakedNativeAssets(
    account: KeyringAccount,
    scope: Network,
    stakedData: SnapOwnedAccountData['stakedData'],
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

    assets.push({
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
    });

    assets.push({
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
    });

    return assets;
  }

  /**
   * Extracts TRX ready for withdrawal (unstaked TRX that has completed the withdrawal period).
   *
   * @param account - The keyring account.
   * @param scope - The network.
   * @param stakedData - Staking data including unfrozen balances.
   * @returns AssetEntity - The ready-for-withdrawal asset (amount may be 0).
   */
  #extractReadyForWithdrawalAsset(
    account: KeyringAccount,
    scope: Network,
    stakedData: SnapOwnedAccountData['stakedData'],
  ): AssetEntity {
    const currentTimestamp = Date.now();
    let readyForWithdrawalAmount = 0;

    stakedData.unfrozenV2?.forEach((unfrozen: RawTronUnfrozenV2) => {
      const expireTime = unfrozen.unfreeze_expire_time ?? 0;
      const amount = unfrozen.unfreeze_amount ?? 0;

      if (expireTime <= currentTimestamp && amount > 0) {
        readyForWithdrawalAmount += amount;
      }
    });

    const { id, symbol, decimals, iconUrl } =
      Networks[scope].readyForWithdrawal;

    return {
      assetType: id,
      keyringAccountId: account.id,
      network: scope,
      symbol,
      decimals,
      rawAmount: readyForWithdrawalAmount.toString(),
      uiAmount: toUiAmount(readyForWithdrawalAmount, decimals).toString(),
      iconUrl,
    };
  }

  /**
   * Extracts staking rewards asset (unclaimed voting rewards).
   *
   * @param account - The keyring account.
   * @param scope - The network.
   * @param stakingRewards - Unclaimed staking rewards in sun.
   * @returns AssetEntity - The staking rewards asset.
   */
  #extractStakingRewardsAsset(
    account: KeyringAccount,
    scope: Network,
    stakingRewards: number,
  ): AssetEntity {
    return {
      assetType: Networks[scope].stakingRewards.id,
      keyringAccountId: account.id,
      network: scope,
      symbol: Networks[scope].stakingRewards.symbol,
      decimals: Networks[scope].stakingRewards.decimals,
      rawAmount: stakingRewards.toString(),
      uiAmount: toUiAmount(
        stakingRewards,
        Networks[scope].stakingRewards.decimals,
      ).toString(),
      iconUrl: Networks[scope].stakingRewards.iconUrl,
    };
  }

  /**
   * Extracts TRX that is in the lock period (unstaked but lock period not yet ended).
   * This represents TRX that the user has initiated unstaking for but must wait
   * the 14-day lock period before they can withdraw.
   *
   * @param account - The keyring account.
   * @param scope - The network.
   * @param stakedData - Staking data including unfrozen balances.
   * @returns AssetEntity - The in-lock-period asset (amount may be 0).
   */
  #extractInLockPeriodAsset(
    account: KeyringAccount,
    scope: Network,
    stakedData: SnapOwnedAccountData['stakedData'],
  ): AssetEntity {
    const currentTimestamp = Date.now();
    let inLockPeriodAmount = 0;

    stakedData.unfrozenV2?.forEach((unfrozen: RawTronUnfrozenV2) => {
      const expireTime = unfrozen.unfreeze_expire_time ?? 0;
      const amount = unfrozen.unfreeze_amount ?? 0;

      if (expireTime > currentTimestamp && amount > 0) {
        inLockPeriodAmount += amount;
      }
    });

    const { id, symbol, decimals, iconUrl } = Networks[scope].inLockPeriod;

    return {
      assetType: id,
      keyringAccountId: account.id,
      network: scope,
      symbol,
      decimals,
      rawAmount: inLockPeriodAmount.toString(),
      uiAmount: toUiAmount(inLockPeriodAmount, decimals).toString(),
      iconUrl,
    };
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

  /**
   * Persist the latest fetched assets and emit the corresponding keyring events.
   *
   * The input is treated as the latest snapshot for the account/network pairs
   * included in this sync. The method compares that snapshot with the
   * previously saved state to detect disappeared assets, emits asset-list
   * updates, and emits balance updates including synthetic zero balances for
   * assets that vanished from the latest response.
   *
   * @param assets - The latest asset snapshot returned by the refresh flow.
   */
  async saveMany(assets: AssetEntity[]): Promise<void> {
    this.#logger.info('Saving assets', assets);

    const shouldEmitAsset = (asset: AssetEntity): boolean =>
      isSnapOwnedAsset(asset.assetType);

    const hasZeroAmount = (asset: AssetEntity): boolean =>
      asset.rawAmount === '0' || asset.uiAmount === '0';

    const savedAssets = await this.getAll();
    const isEssentialAsset = (asset: AssetEntity): boolean =>
      ESSENTIAL_ASSETS.includes(asset.assetType);

    const isProtectedAsset = (asset: AssetEntity): boolean =>
      isSnapOwnedAsset(asset.assetType);

    // Track only the account/network pairs refreshed in this run.
    // That prevents us from treating assets from untouched networks as disappeared.
    const syncedNetworksByAccount = assets.reduce<Record<string, Set<Network>>>(
      (acc, asset) => {
        acc[asset.keyringAccountId] ??= new Set();
        acc[asset.keyringAccountId]?.add(asset.network);
        return acc;
      },
      {},
    );

    const incomingAssetKeys = new Set(
      assets.map((asset) => `${asset.keyringAccountId}:${asset.assetType}`),
    );

    // A saved asset is considered disappeared only if its network was part of
    // this sync, it is not essential, and it is missing from the latest
    // snapshot for that account.
    const disappearedAssets = savedAssets.filter((savedAsset) => {
      const syncedNetworks =
        syncedNetworksByAccount[savedAsset.keyringAccountId];

      if (
        !syncedNetworks?.has(savedAsset.network) ||
        isProtectedAsset(savedAsset)
      ) {
        return false;
      }

      if (!isSnapOwnedAsset(savedAsset.assetType)) {
        return false;
      }

      return !incomingAssetKeys.has(
        `${savedAsset.keyringAccountId}:${savedAsset.assetType}`,
      );
    });

    // A token should be removed from the visible asset list only when the latest
    // snapshot says its balance is zero. Essential assets stay visible even at
    // zero because they are part of the permanent Tron account model.
    const shouldBeInRemovedList = (asset: AssetEntity): boolean =>
      hasZeroAmount(asset) && !isEssentialAsset(asset); // Never remove essential assets (including energy & bandwidth) from the account asset list

    // Assets are added to the visible list when they are non-zero and either:
    // - we are doing a full non-incremental broadcast, or
    // - they are brand new, or
    // - they existed before with zero balance and now became non-zero.
    const shouldBeInAddedList = (asset: AssetEntity): boolean =>
      !shouldBeInRemovedList(asset);

    // Build the asset-list payload in two stages:
    // 1. seed the removed list with assets that vanished from the latest
    //    snapshot entirely
    // 2. fold in the current assets to report additions and explicit zero-balance
    //    removals in the same event
    const assetListUpdatedPayload = disappearedAssets
      .filter(shouldEmitAsset)
      .reduce<AccountAssetListUpdatedEvent['params']['assets']>(
        (acc, asset) => ({
          ...acc,
          [asset.keyringAccountId]: {
            added: [...(acc[asset.keyringAccountId]?.added ?? [])],
            removed: [
              ...(acc[asset.keyringAccountId]?.removed ?? []),
              asset.assetType,
            ],
          },
        }),
        {},
      );

    for (const asset of assets.filter(shouldEmitAsset)) {
      // Merge the current snapshot into the pre-seeded payload so each account
      // ends up with one consolidated added/removed diff.
      assetListUpdatedPayload[asset.keyringAccountId] = {
        added: [
          ...(assetListUpdatedPayload[asset.keyringAccountId]?.added ?? []),
          ...(shouldBeInAddedList(asset) ? [asset.assetType] : []),
        ],
        removed: [
          ...(assetListUpdatedPayload[asset.keyringAccountId]?.removed ?? []),
          ...(shouldBeInRemovedList(asset) ? [asset.assetType] : []),
        ],
      };
    }

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

    // Emit synthetic zero-balance entries for disappeared assets so clients can
    // clear cached balances even when the backend omits zero-balance tokens
    // instead of returning them explicitly.
    const removedAssetsWithZeroBalance = disappearedAssets
      .filter(shouldEmitAsset)
      .map((asset) => ({
        ...asset,
        rawAmount: '0',
        uiAmount: '0',
      }));

    const assetsToSave = [...assets, ...removedAssetsWithZeroBalance];
    // Save assets using repository
    await this.#assetsRepository.saveMany(assetsToSave);

    // Broadcast the current snapshot plus synthetic zero-balance removals so the
    // client can reconcile both visible assets and cached balances in one pass.
    const balancesUpdatedPayload = [
      ...assets.filter(shouldEmitAsset),
      ...removedAssetsWithZeroBalance,
    ].reduce<AccountBalancesUpdatedEvent['params']['balances']>(
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

    const visibleSavedAssets = savedAssets.filter((asset) =>
      isSnapOwnedAsset(asset.assetType),
    );

    /**
     * Ensure the special assets are always present whether they have been synced or not.
     * These are assets that should be visible to the user even with zero balance.
     */
    const missingEssentialAssets: AssetEntity[] = [];

    for (const essentialAssetId of ESSENTIAL_ASSETS) {
      if (!isSnapOwnedAsset(essentialAssetId)) {
        continue;
      }

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

    return [...visibleSavedAssets, ...missingEssentialAssets];
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
