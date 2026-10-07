import type { Asset, Caip19AssetId } from '@metamask/assets-controller';
import { KeyringEvent } from '@metamask/keyring-api';
import type {
  AccountAssetListUpdatedEvent,
  AccountBalancesUpdatedEvent,
  KeyringAccount,
} from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import type { AssetsProvider } from '@metamask/snap-networks-utils';
import { Logger } from '@metamask/snap-networks-utils';
import { parseCaipAssetType } from '@metamask/utils';

import { Network } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';
import logger from '../../../utils/logger';
import type { SnapAssetsAdapter } from './SnapAssetsAdapter';
import { isSnapOwnedAsset } from '../utils/isSnapOwnedAsset';
import { mapControllerAsset } from '../utils/mapControllerAsset';
import { toInternalAccount } from '../utils/toInternalAccount';

export type CoreAssetsAdapterOptions = {
  getAccountAssetByID: AssetsProvider['getAccountAssetByID'];
  getAccountAssetsByIDs: AssetsProvider['getAccountAssetsByIDs'];
  getAccountAssetsByScope: AssetsProvider['getAccountAssetsByScope'];
  getAssets: AssetsProvider['getAssets'];
  fetchSnapOwnedAssets: SnapAssetsAdapter['fetchAssetsAndBalancesForAccount'];
};

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

  readonly #fetchSnapOwnedAssets: SnapAssetsAdapter['fetchAssetsAndBalancesForAccount'];

  constructor(options: CoreAssetsAdapterOptions) {
    const {
      getAccountAssetByID,
      getAccountAssetsByIDs,
      getAccountAssetsByScope,
      getAssets,
      fetchSnapOwnedAssets,
    } = options;

    this.#logger = logger.withPrefix('[CoreAssetsAdapter]');
    this.#getAccountAssetByID = getAccountAssetByID;
    this.#getAccountAssetsByIDs = getAccountAssetsByIDs;
    this.#getAccountAssetsByScope = getAccountAssetsByScope;
    this.#getAssets = getAssets;
    this.#fetchSnapOwnedAssets = fetchSnapOwnedAssets;
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
          this.#fetchSnapOwnedAssets(scope as Network, account),
        ),
      ),
      this.#getAssets([{ ...toInternalAccount(account), scopes }], {
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
   * Fetches live assets and balances for the given account across all its
   * scopes through the AssetsController's fetch pipeline (`getAssets` with
   * `forceUpdate` and `bypassServerCache`, so neither client nor server
   * caches are used).
   *
   * @param account - The keyring account.
   * @returns The freshly fetched assets.
   */
  async fetchAccountAssets(account: KeyringAccount): Promise<AssetEntity[]> {
    this.#logger.info('Fetching assets and balances via AssetsController', {
      accountId: account.id,
      scopes: account.scopes,
    });

    const results = await this.#getAssets([toInternalAccount(account)], {
      chainIds: account.scopes,
      forceUpdate: true,
      bypassServerCache: true,
    });

    const accountAssets = results[account.id] ?? {};

    return Object.values(accountAssets).map((asset: Asset) =>
      mapControllerAsset(account.id, asset),
    );
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
