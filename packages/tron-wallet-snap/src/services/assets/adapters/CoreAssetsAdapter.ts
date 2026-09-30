import type { Asset, Caip19AssetId } from '@metamask/assets-controller';
import { KeyringEvent } from '@metamask/keyring-api';
import type {
  AccountAssetListUpdatedEvent,
  AccountBalancesUpdatedEvent,
  KeyringAccount,
} from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import type { AssetsProvider } from '@metamask/snap-networks-utils';
import { Logger } from '@metamask/snap-networks-utils';
import type { CaipChainId } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import type { TronHttpClient } from '../../../clients/tron-http/TronHttpClient';
import { TrongridAccountNotFoundError } from '../../../clients/trongrid/errors';
import type { TrongridApiClient } from '../../../clients/trongrid/TrongridApiClient';
import { Network } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';
import logger from '../../../utils/logger';
import { buildStakedData } from '../utils/buildStakedData';
import { extractBandwidth } from '../utils/extractBandwidth';
import { extractEnergy } from '../utils/extractEnergy';
import { extractInLockPeriodAsset } from '../utils/extractInLockPeriodAsset';
import { extractReadyForWithdrawalAsset } from '../utils/extractReadyForWithdrawalAsset';
import { extractStakedNativeAssets } from '../utils/extractStakedNativeAssets';
import { extractStakingRewardsAsset } from '../utils/extractStakingRewardsAsset';
import { isSnapOwnedAsset } from '../utils/isSnapOwnedAsset';
import { mapControllerAsset } from '../utils/mapControllerAsset';

export type CoreAssetsAdapterOptions = {
  getAccountAssetByID: AssetsProvider['getAccountAssetByID'];
  getAccountAssetsByIDs: AssetsProvider['getAccountAssetsByIDs'];
  getAccountAssetsByScope: AssetsProvider['getAccountAssetsByScope'];
  getAssets: AssetsProvider['getAssets'];
  getAddressInfo: TrongridApiClient['getAccountInfoByAddress'];
  getAddressResources: TronHttpClient['getAccountResources'];
  getAddressStakingRewards: TronHttpClient['getReward'];
};

/**
 * Builds the account descriptor the controller's one-time fetch pipeline
 * expects. The controller only consumes `id`, `address`, and `scopes` from it,
 * so the keyring account's shape is sufficient and the metadata is a stub.
 *
 * @param account - The keyring account.
 * @param scopes - The CAIP-2 chain IDs to scope the fetch to.
 * @returns An InternalAccount-compatible descriptor.
 */
function toInternalAccount(
  account: KeyringAccount,
  scopes: CaipChainId[],
): InternalAccount {
  return {
    id: account.id,
    address: account.address,
    type: account.type,
    scopes,
    methods: account.methods,
    options: account.options,
    metadata: {
      name: 'Tron Account',
      keyring: { type: 'Snap Keyring' },
    },
  } as unknown as InternalAccount;
}

/**
 * Uses the AssetsController for fungible reads. Snap-owned (special) assets are
 * published via keyring events without local persistence when migration is active.
 */
export class CoreAssetsAdapter {
  readonly #logger: Logger;

  readonly #getAccountAssetByID: AssetsProvider['getAccountAssetByID'];

  readonly #getAccountAssetsByIDs: AssetsProvider['getAccountAssetsByIDs'];

  readonly #getAccountAssetsByScope: AssetsProvider['getAccountAssetsByScope'];

  readonly #getAssets: AssetsProvider['getAssets'];

  readonly #getAddressInfo: TrongridApiClient['getAccountInfoByAddress'];

  readonly #getAddressResources: TronHttpClient['getAccountResources'];

  readonly #getAddressStakingRewards: TronHttpClient['getReward'];

  constructor(options: CoreAssetsAdapterOptions) {
    const {
      getAccountAssetByID,
      getAccountAssetsByIDs,
      getAccountAssetsByScope,
      getAssets,
      getAddressInfo,
      getAddressResources,
      getAddressStakingRewards,
    } = options;

    this.#logger = logger.withPrefix('[CoreAssetsAdapter]');
    this.#getAccountAssetByID = getAccountAssetByID;
    this.#getAccountAssetsByIDs = getAccountAssetsByIDs;
    this.#getAccountAssetsByScope = getAccountAssetsByScope;
    this.#getAssets = getAssets;
    this.#getAddressInfo = getAddressInfo;
    this.#getAddressResources = getAddressResources;
    this.#getAddressStakingRewards = getAddressStakingRewards;
  }

  async getAccountAssetByID(
    accountId: string,
    assetId: Caip19AssetId,
  ): Promise<AssetEntity | null> {
    this.#logger.info('Getting account asset by ID', { accountId, assetId });
    const asset = await this.#getAccountAssetByID(accountId, assetId);

    if (!asset) {
      return null;
    }

    return mapControllerAsset(accountId, asset);
  }

  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: Caip19AssetId[],
  ): Promise<(AssetEntity | null)[]> {
    this.#logger.info('Getting account assets by IDs', { accountId, assetIds });
    const assets = await this.#getAccountAssetsByIDs(accountId, assetIds);

    return assetIds.map((assetId) => {
      const asset = assets[assetId];
      return asset ? mapControllerAsset(accountId, asset) : null;
    });
  }

  async getAccountAssetsByScope(
    scope: Network,
    accountId: string,
  ): Promise<AssetEntity[]> {
    this.#logger.info('Getting account assets by scope', {
      scope,
      accountId,
    });
    const controllerAssets = await this.#getAccountAssetsByScope(
      scope,
      accountId,
    );

    return Object.values(controllerAssets).map((asset: Asset) =>
      mapControllerAsset(accountId, asset),
    );
  }

  async getAccountAssets(accountId: string): Promise<AssetEntity[]> {
    const [mainnetAssets, nileAssets, shastaAssets] = await Promise.all([
      this.#getAccountAssetsByScope(Network.Mainnet, accountId),
      this.#getAccountAssetsByScope(Network.Nile, accountId),
      this.#getAccountAssetsByScope(Network.Shasta, accountId),
    ]);

    const allUnmappedAssets: Asset[] = [
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
   * Fetches fresh assets for the requested asset IDs, guaranteeing up-to-date
   * data for flows that act on-chain or display actionable values.
   *
   * Combines both freshness strategies:
   * - Controller-tracked assets (native TRX, TRC20) come from the controller's
   *   one-time fetch pipeline (`AssetsController:getAssets` with
   *   `forceUpdate` and `bypassServerCache`), reading the fresh fetch result
   *   directly.
   * - Snap-owned assets (staking positions, energy, bandwidth) are fetched
   *   directly from Tron RPC via the Snap's own sync flow, since the
   *   controller only sees them through asynchronously published updates.
   *
   * @param account - The keyring account to fetch assets for.
   * @param assetIds - CAIP-19 asset IDs to resolve fresh values for.
   * @returns Assets keyed in the same order as the requested asset IDs, with
   * `null` for asset IDs that could not be resolved.
   */
  async getFreshAccountAssetsByIDs(
    account: KeyringAccount,
    assetIds: Caip19AssetId[],
  ): Promise<(AssetEntity | null)[]> {
    const scopes = [
      ...new Set(
        assetIds.map((assetId) => parseCaipAssetType(assetId).chainId),
      ),
    ];

    const [snapOwnedFetches, controllerAssets] = await Promise.all([
      Promise.all(
        scopes.map((scope) =>
          this.fetchAssetsAndBalancesForAccount(scope as Network, account),
        ),
      ),
      this.#getAssets([toInternalAccount(account, scopes)], {
        chainIds: scopes,
        forceUpdate: true,
        bypassServerCache: true,
      }),
    ]);

    const snapOwnedAssets = snapOwnedFetches.flat();

    return assetIds.map((assetId) => {
      if (isSnapOwnedAsset(assetId)) {
        return (
          snapOwnedAssets.find((asset) => asset.assetType === assetId) ?? null
        );
      }

      const asset = controllerAssets[account.id]?.[assetId];
      return asset ? mapControllerAsset(account.id, asset) : null;
    });
  }

  /**
   * Fetches a single fresh asset for the given asset ID.
   *
   * @param account - The keyring account to fetch the asset for.
   * @param assetId - CAIP-19 asset ID to resolve a fresh value for.
   * @returns The fresh asset, or `null` if it could not be resolved.
   */
  async getFreshAccountAssetByID(
    account: KeyringAccount,
    assetId: Caip19AssetId,
  ): Promise<AssetEntity | null> {
    const [asset] = await this.getFreshAccountAssetsByIDs(account, [assetId]);
    return asset ?? null;
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

    /**
     * `getAccountInfoByAddress` rejects with `TrongridAccountNotFoundError` for
     * inactive accounts. We still wait for all three requests, then rethrow
     * unexpected failures (HTTP errors, timeouts) so they are not mistaken for
     * an inactive account.
     */
    const [
      addressInfoRequest,
      addressResourcesRequest,
      addressStakingRewardsRequest,
    ] = await Promise.allSettled([
      this.#getAddressInfo(scope, account.address),
      this.#getAddressResources(scope, account.address),
      this.#getAddressStakingRewards(scope, account.address),
    ]);

    /**
     * If any of the requests fail let's treat it as a panic except for the inactive account case.
     */
    if (
      addressInfoRequest.status === 'rejected' &&
      !(addressInfoRequest.reason instanceof TrongridAccountNotFoundError)
    ) {
      throw addressInfoRequest.reason;
    }

    if (addressResourcesRequest.status === 'rejected') {
      throw addressResourcesRequest.reason;
    }

    if (addressStakingRewardsRequest.status === 'rejected') {
      throw addressStakingRewardsRequest.reason;
    }

    const stakedData = buildStakedData(addressInfoRequest);
    const resources = addressResourcesRequest.value;
    const stakingRewards = Math.max(0, addressStakingRewardsRequest.value);

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
