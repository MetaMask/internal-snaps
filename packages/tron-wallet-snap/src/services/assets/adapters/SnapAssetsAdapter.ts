import { KeyringEvent } from '@metamask/keyring-api';
import type {
  AccountAssetListUpdatedEvent,
  AccountBalancesUpdatedEvent,
  KeyringAccount,
} from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import type { CaipAssetType } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import type { AccountResources } from '../../../clients/tron-http';
import type { TronHttpClient } from '../../../clients/tron-http/TronHttpClient';
import type { TrongridApiClient } from '../../../clients/trongrid/TrongridApiClient';
import type {
  RawTronUnfrozenV2,
  TronAccount,
} from '../../../clients/trongrid/types';
import type { KnownCaip19Id, Network } from '../../../constants';
import { ESSENTIAL_ASSETS, Networks, TokenMetadata } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';
import { toUiAmount } from '../../../utils/conversion';
import { createPrefixedLogger } from '../../../utils/logger';
import type { ILogger } from '../../../utils/logger';
import type { AssetsRepository } from '../AssetsRepository';
import { isSnapOwnedAsset } from '../snapOwnedAssets';

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

export class SnapAssetsAdapter {
  readonly #logger: ILogger;

  readonly #assetsRepository: AssetsRepository;

  readonly #trongridApiClient: TrongridApiClient;

  readonly #tronHttpClient: TronHttpClient;

  constructor({
    logger,
    assetsRepository,
    trongridApiClient,
    tronHttpClient,
  }: {
    logger: ILogger;
    assetsRepository: AssetsRepository;
    trongridApiClient: TrongridApiClient;
    tronHttpClient: TronHttpClient;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🪙 SnapAssetsAdapter]');
    this.#assetsRepository = assetsRepository;
    this.#trongridApiClient = trongridApiClient;
    this.#tronHttpClient = tronHttpClient;
  }

  async getAccountAssetsByIDs(
    accountId: string,
    assetTypes: string[],
  ): Promise<(AssetEntity | null)[]> {
    return this.#assetsRepository.getByAccountIdAndAssetTypes(
      accountId,
      assetTypes,
    );
  }

  async getAccountAssetByID(
    accountId: string,
    assetType: string,
  ): Promise<AssetEntity | null> {
    return this.#assetsRepository.getByAccountIdAndAssetType(
      accountId,
      assetType,
    );
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
  async fetchSnapOwnedAssetsForAccount(
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

    const savedAssets = await this.#assetsRepository.getAll();

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

    // A saved snap-owned asset is considered disappeared only if its network was
    // part of this sync and it is missing from the latest snapshot for that account.
    const disappearedAssets = savedAssets.filter((savedAsset) => {
      const syncedNetworks =
        syncedNetworksByAccount[savedAsset.keyringAccountId];

      if (!syncedNetworks?.has(savedAsset.network)) {
        return false;
      }

      if (!isSnapOwnedAsset(savedAsset.assetType)) {
        return false;
      }

      return !incomingAssetKeys.has(
        `${savedAsset.keyringAccountId}:${savedAsset.assetType}`,
      );
    });

    // Snap-owned assets stay visible even at zero because they are part of the
    // permanent Tron account model managed by the Snap.
    const shouldBeInRemovedList = (asset: AssetEntity): boolean =>
      hasZeroAmount(asset) && !isSnapOwnedAsset(asset.assetType);

    const shouldBeInAddedList = (asset: AssetEntity): boolean =>
      !shouldBeInRemovedList(asset);

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

    const removedAssetsWithZeroBalance = disappearedAssets
      .filter(shouldEmitAsset)
      .map((asset) => ({
        ...asset,
        rawAmount: '0',
        uiAmount: '0',
      }));

    const assetsToSave = [
      ...assets.filter(shouldEmitAsset),
      ...removedAssetsWithZeroBalance,
    ];
    await this.#assetsRepository.saveMany(assetsToSave);

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

    const isSomeBalanceChanged = Object.values(balancesUpdatedPayload)
      .map((accountAssets) => Object.keys(accountAssets).length)
      .some((count) => count > 0);

    if (isSomeBalanceChanged) {
      await emitSnapKeyringEvent(snap, KeyringEvent.AccountBalancesUpdated, {
        balances: balancesUpdatedPayload,
      });
    }
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

  async getAccountAssetsByScope(
    scope: Network,
    keyringAccountId: string,
  ): Promise<AssetEntity[]> {
    const savedAssets =
      await this.#assetsRepository.getByAccountId(keyringAccountId);

    const visibleSavedAssets = savedAssets.filter(
      (asset) => asset.network === scope,
    );

    const missingEssentialAssets: AssetEntity[] = [];

    for (const essentialAssetId of ESSENTIAL_ASSETS) {
      const { chainId } = parseCaipAssetType(essentialAssetId as CaipAssetType);

      if ((chainId as Network) !== scope) {
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
}
