import type { Caip19AssetId } from '@metamask/assets-controller';
import { KeyringEvent } from '@metamask/keyring-api';
import type {
  AccountAssetListUpdatedEvent,
  AccountBalancesUpdatedEvent,
} from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import type { AssetsProvider } from '@metamask/snap-networks-utils';

import { Network } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';
import { createPrefixedLogger } from '../../../utils/logger';
import type { ILogger } from '../../../utils/logger';
import { mapControllerAsset } from '../mapControllerAsset';
import { isSnapOwnedAsset } from '../snapOwnedAssets';

/**
 * Uses the AssetsController for fungible reads. Snap-owned (special) assets are
 * published via keyring events without local persistence when migration is active.
 */
export class CoreAssetsAdapter {
  readonly #logger: ILogger;

  readonly #assetsProvider: AssetsProvider;

  constructor({
    logger,
    assetsProvider,
  }: {
    logger: ILogger;
    assetsProvider: AssetsProvider;
  }) {
    this.#logger = createPrefixedLogger(logger, '[CoreAssetsAdapter]');
    this.#assetsProvider = assetsProvider;
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
   * Publishes snap-owned assets to the extension without persisting locally.
   * Always emits the full special-asset set from the payload as `added`, plus
   * balances for those assets (including zeros).
   *
   * @param assets - Latest asset snapshot (fungibles are ignored).
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
    >((acc, asset) => {
      const existing = acc[asset.keyringAccountId] ?? {
        added: [],
        removed: [],
      };
      const added = existing.added.includes(asset.assetType)
        ? existing.added
        : [...existing.added, asset.assetType];

      return {
        ...acc,
        [asset.keyringAccountId]: {
          added,
          removed: existing.removed,
        },
      };
    }, {});

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
