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

import { Network } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';
import logger from '../../../utils/logger';
import { isSnapOwnedAsset } from '../utils/isSnapOwnedAsset';
import { mapControllerAsset } from '../utils/mapControllerAsset';
import { toInternalAccount } from '../utils/toInternalAccount';

export type CoreAssetsAdapterOptions = {
  getAccountAssetByID: AssetsProvider['getAccountAssetByID'];
  getAccountAssetsByIDs: AssetsProvider['getAccountAssetsByIDs'];
  getAccountAssetsByScope: AssetsProvider['getAccountAssetsByScope'];
  getAssets: AssetsProvider['getAssets'];
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

  constructor(options: CoreAssetsAdapterOptions) {
    const {
      getAccountAssetByID,
      getAccountAssetsByIDs,
      getAccountAssetsByScope,
      getAssets,
    } = options;

    this.#logger = logger.withPrefix('[CoreAssetsAdapter]');
    this.#getAccountAssetByID = getAccountAssetByID;
    this.#getAccountAssetsByIDs = getAccountAssetsByIDs;
    this.#getAccountAssetsByScope = getAccountAssetsByScope;
    this.#getAssets = getAssets;
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
  async saveManyAndEmit(assets: AssetEntity[]): Promise<void> {
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
