import { KeyringEvent } from '@metamask/keyring-api';
import type {
  AccountAssetListUpdatedEvent,
  AccountBalancesUpdatedEvent,
} from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import type { AssetsProvider } from '@metamask/snap-networks-utils';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';

import type { AssetEntity, SolanaKeyringAccount } from '../../../../entities';
import logger, { createPrefixedLogger } from '../../../utils/logger';
import type { ILogger } from '../../../utils/logger';
import type { AccountsService } from '../../accounts/AccountsService';
import type { ConfigProvider } from '../../config';
import { isSnapOwnedAsset } from '../utils/isSnapOwnedAsset';
import { mapControllerAsset } from '../utils/mapControllerAsset';

export type CoreAssetsAdapterOptions = {
  getAccountAssetByID: AssetsProvider['getAccountAssetByID'];
  getAccountAssetsByIDs: AssetsProvider['getAccountAssetsByIDs'];
  getAccountAssetsByScope: AssetsProvider['getAccountAssetsByScope'];
  findAccountById: AccountsService['findById'];
  getActiveNetworks: ConfigProvider['getActiveNetworks'];
};

/**
 * Uses the AssetsController for fungible reads. Snap-owned (NFT) assets are
 * published via keyring events without local persistence when migration is active.
 */
export class CoreAssetsAdapter {
  readonly #logger: ILogger;

  readonly #getAccountAssetByID: AssetsProvider['getAccountAssetByID'];

  readonly #getAccountAssetsByIDs: AssetsProvider['getAccountAssetsByIDs'];

  readonly #getAccountAssetsByScope: AssetsProvider['getAccountAssetsByScope'];

  readonly #findAccountById: AccountsService['findById'];

  readonly #getActiveNetworks: ConfigProvider['getActiveNetworks'];

  constructor(options: CoreAssetsAdapterOptions) {
    const {
      getAccountAssetByID,
      getAccountAssetsByIDs,
      getAccountAssetsByScope,
      findAccountById,
      getActiveNetworks,
    } = options;

    this.#logger = createPrefixedLogger(logger, '[🪙 CoreAssetsAdapter]');
    this.#getAccountAssetByID = getAccountAssetByID;
    this.#getAccountAssetsByIDs = getAccountAssetsByIDs;
    this.#getAccountAssetsByScope = getAccountAssetsByScope;
    this.#findAccountById = findAccountById;
    this.#getActiveNetworks = getActiveNetworks;
  }

  async #resolveAccountAddress(accountId: string): Promise<string | null> {
    const account = await this.#findAccountById(accountId);
    return account?.address ?? null;
  }

  async getAccountAssetByID(
    accountId: string,
    assetId: CaipAssetType,
  ): Promise<AssetEntity | null> {
    this.#logger.info('Getting account asset by ID', { accountId, assetId });

    const accountAddress = await this.#resolveAccountAddress(accountId);
    if (!accountAddress) {
      return null;
    }

    const asset = await this.#getAccountAssetByID(accountId, assetId);

    if (!asset) {
      return null;
    }

    return mapControllerAsset(accountId, accountAddress, asset);
  }

  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: CaipAssetType[],
  ): Promise<Record<CaipAssetType, AssetEntity | null>> {
    this.#logger.info('Getting account assets by IDs', { accountId, assetIds });

    if (assetIds.length === 0) {
      return {} as Record<CaipAssetType, AssetEntity | null>;
    }

    const accountAddress = await this.#resolveAccountAddress(accountId);
    if (!accountAddress) {
      return Object.fromEntries(
        assetIds.map((assetId) => [assetId, null]),
      ) as Record<CaipAssetType, AssetEntity | null>;
    }

    const assets = await this.#getAccountAssetsByIDs(accountId, assetIds);

    const entries = await Promise.all(
      assetIds.map(async (assetId) => {
        const asset = assets[assetId];
        if (!asset) {
          return [assetId, null] as const;
        }

        const entity = await mapControllerAsset(
          accountId,
          accountAddress,
          asset,
        );
        return [assetId, entity] as const;
      }),
    );

    return Object.fromEntries(entries) as Record<
      CaipAssetType,
      AssetEntity | null
    >;
  }

  async getAccountAssetsByScope(
    scope: CaipChainId,
    accountId: string,
  ): Promise<AssetEntity[]> {
    this.#logger.info('Getting account assets by scope', {
      scope,
      accountId,
    });

    const accountAddress = await this.#resolveAccountAddress(accountId);
    if (!accountAddress) {
      return [];
    }

    const controllerAssets = await this.#getAccountAssetsByScope(
      scope,
      accountId,
    );

    return Promise.all(
      Object.values(controllerAssets).map(async (asset) =>
        mapControllerAsset(accountId, accountAddress, asset),
      ),
    );
  }

  async getAccountAssets(accountId: string): Promise<AssetEntity[]> {
    const activeNetworks = await this.#getActiveNetworks();
    const assetsByScope = await Promise.all(
      activeNetworks.map(async (scope) =>
        this.getAccountAssetsByScope(scope, accountId),
      ),
    );

    return assetsByScope.flat();
  }

  /**
   * Fungible balances come from AssetsController once migration is active.
   * Snap-owned NFT fetch is not produced here (matching the Snap adapter,
   * which currently does not return NFT balances from `fetch`).
   *
   * @param account - The keyring account.
   * @returns Snap-owned assets for the account (currently none).
   */
  async fetch(account: SolanaKeyringAccount): Promise<AssetEntity[]> {
    this.#logger.info('Fetching snap-owned assets for account', { account });
    return [];
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
