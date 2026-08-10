import type { Caip19AssetId } from '@metamask/assets-controller';
import { KeyringEvent } from '@metamask/keyring-api';
import type {
  AccountAssetListUpdatedEvent,
  AccountBalancesUpdatedEvent,
  KeyringAccount,
} from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import type { AssetsProvider } from '@metamask/snap-networks-utils';

import type { TronHttpClient } from '../../../clients/tron-http/TronHttpClient';
import type { TrongridApiClient } from '../../../clients/trongrid/TrongridApiClient';
import { Network } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';
import { createPrefixedLogger } from '../../../utils/logger';
import type { ILogger } from '../../../utils/logger';
import { buildAccountResources } from '../utils/buildAccountResources';
import { buildStakedData } from '../utils/buildStakedData';
import { extractBandwidth } from '../utils/extractBandwidth';
import { extractEnergy } from '../utils/extractEnergy';
import { extractInLockPeriodAsset } from '../utils/extractInLockPeriodAsset';
import { extractReadyForWithdrawalAsset } from '../utils/extractReadyForWithdrawalAsset';
import { extractStakedNativeAssets } from '../utils/extractStakedNativeAssets';
import { extractStakingRewardsAsset } from '../utils/extractStakingRewardsAsset';
import { isSnapOwnedAsset } from '../utils/isSnapOwnedAsset';
import { mapControllerAsset } from '../utils/mapControllerAsset';

/**
 * Uses the AssetsController for fungible reads. Snap-owned (special) assets are
 * published via keyring events without local persistence when migration is active.
 */
export class CoreAssetsAdapter {
  readonly #logger: ILogger;

  readonly #assetsProvider: AssetsProvider;

  readonly #trongridApiClient: TrongridApiClient;

  readonly #tronHttpClient: TronHttpClient;

  constructor({
    logger,
    assetsProvider,
    trongridApiClient,
    tronHttpClient,
  }: {
    logger: ILogger;
    assetsProvider: AssetsProvider;
    trongridApiClient: TrongridApiClient;
    tronHttpClient: TronHttpClient;
  }) {
    this.#logger = createPrefixedLogger(logger, '[CoreAssetsAdapter]');
    this.#assetsProvider = assetsProvider;
    this.#trongridApiClient = trongridApiClient;
    this.#tronHttpClient = tronHttpClient;
  }

  async getAccountAssetByID(
    accountId: string,
    assetId: string,
  ): Promise<AssetEntity | null> {
    this.#logger.info('Getting account asset by ID', { accountId, assetId });
    const asset = await this.#assetsProvider.getAccountAssetByID(
      accountId,
      assetId as Caip19AssetId,
    );

    if (!asset) {
      return null;
    }

    return mapControllerAsset(accountId, asset);
  }

  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: string[],
  ): Promise<(AssetEntity | null)[]> {
    this.#logger.info('Getting account assets by IDs', { accountId, assetIds });
    const assets = await this.#assetsProvider.getAccountAssetsByIDs(
      accountId,
      assetIds as Caip19AssetId[],
    );

    return assetIds.map((assetId) => {
      const asset = assets[assetId as Caip19AssetId];
      return asset ? mapControllerAsset(accountId, asset) : null;
    });
  }

  async getAccountAssetsByScope(
    scope: Network,
    keyringAccountId: string,
  ): Promise<AssetEntity[]> {
    this.#logger.info('Getting account assets by scope', {
      scope,
      keyringAccountId,
    });
    const controllerAssets = await this.#assetsProvider.getAccountAssetsByScope(
      scope,
      keyringAccountId,
    );

    return Object.values(controllerAssets).map((asset) =>
      mapControllerAsset(keyringAccountId, asset),
    );
  }

  async getAccountAssets(accountId: string): Promise<AssetEntity[]> {
    this.#logger.info('Getting account assets', { accountId });
    const [mainnetAssets, nileAssets, shastaAssets] = await Promise.all([
      this.#assetsProvider.getAccountAssetsByScope(Network.Mainnet, accountId),
      this.#assetsProvider.getAccountAssetsByScope(Network.Nile, accountId),
      this.#assetsProvider.getAccountAssetsByScope(Network.Shasta, accountId),
    ]);

    const allUnmappedAssets = [
      ...Object.values(mainnetAssets),
      ...Object.values(nileAssets),
      ...Object.values(shastaAssets),
    ];
    const allAssets = allUnmappedAssets.map((asset) =>
      mapControllerAsset(accountId, asset),
    );

    return allAssets;
  }

  /**
   * We used to fetch all assets and balances but now the Snap is only responsible for fetching snap-owned assets.
   * - Energy & Bandwidth
   * - Staked TRX and full staking lifecycle (rewards, in lock period, ready for withdrawal)
   *
   * @param scope - The network to query.
   * @param account - The keyring account.
   * @returns Promise<AssetEntity[]> - Array of assets with balances.
   */
  async fetchAssetsAndBalancesForAccount(
    scope: Network,
    account: KeyringAccount,
  ): Promise<AssetEntity[]> {
    this.#logger.info('Fetching assets and balances for account', {
      scope,
      account,
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

    const stakedData = buildStakedData(tronAccountInfoRequest);
    const resources = buildAccountResources(tronAccountResourcesRequest);
    const stakingRewards =
      stakingRewardsRequest.status === 'fulfilled'
        ? Math.max(0, stakingRewardsRequest.value)
        : 0;

    return [
      ...extractStakedNativeAssets(account, scope, stakedData),
      extractReadyForWithdrawalAsset(account, scope, stakedData),
      extractInLockPeriodAsset(account, scope, stakedData),
      extractStakingRewardsAsset(account, scope, stakingRewards),
      ...extractBandwidth({
        account,
        scope,
        tronAccountResources: resources,
      }),
      ...extractEnergy({
        account,
        scope,
        tronAccountResources: resources,
      }),
    ];
  }

  /**
   * Publishes snap-owned assets to the extension without persisting locally.
   *
   * Filters to snap-owned assets, reports each as `added`, and emits balance
   * updates for those assets.
   *
   * @param assets - Assets to publish (non snap-owned entries are ignored).
   */
  async saveMany(assets: AssetEntity[]): Promise<void> {
    this.#logger.info('Publishing snap-owned assets', assets);

    const snapOwnedAssets = assets.filter((asset) =>
      isSnapOwnedAsset(asset.assetType),
    );

    if (snapOwnedAssets.length === 0) {
      return;
    }

    const assetListUpdatedPayload = snapOwnedAssets.reduce<
      AccountAssetListUpdatedEvent['params']['assets']
    >(
      (acc, asset) => ({
        ...acc,
        [asset.keyringAccountId]: {
          added: [
            ...(acc[asset.keyringAccountId]?.added ?? []),
            asset.assetType,
          ],
          removed: [],
        },
      }),
      {},
    );

    await emitSnapKeyringEvent(snap, KeyringEvent.AccountAssetListUpdated, {
      assets: assetListUpdatedPayload,
    });

    const balancesUpdatedPayload = snapOwnedAssets.reduce<
      AccountBalancesUpdatedEvent['params']['balances']
    >(
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

    await emitSnapKeyringEvent(snap, KeyringEvent.AccountBalancesUpdated, {
      balances: balancesUpdatedPayload,
    });
  }
}
