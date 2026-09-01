import type { Asset } from '@metamask/assets-controller';
import type { AssetsProvider, Logger } from '@metamask/snap-networks-utils';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';

import type { AssetEntity } from '../../../../entities';
import type { AccountsService } from '../../accounts/AccountsService';
import type { ConfigProvider } from '../../config';
import { mapControllerAsset } from '../utils/mapControllerAsset';

export type CoreAssetsAdapterOptions = {
  logger: Logger;
  getAccountAssetByID: AssetsProvider['getAccountAssetByID'];
  getAccountAssetsByIDs: AssetsProvider['getAccountAssetsByIDs'];
  getAccountAssetsByScope: AssetsProvider['getAccountAssetsByScope'];
  findAccountById: AccountsService['findById'];
  getActiveNetworks: ConfigProvider['getActiveNetworks'];
};

/**
 * Reads fungible balances from AssetsController.
 *
 * Solana has no snap-owned assets (unlike Tron staking/energy/bandwidth), so
 * this adapter does not fetch, persist, or publish balances, and does not
 * monitor addresses for snap-owned changes.
 *
 * AssetsController stores SPL balances by mint, not by associated token
 * account. Transaction history resolves the token-account address only when
 * it needs to query signatures, so reading balances does not fetch mint data.
 */
export class CoreAssetsAdapter {
  readonly #logger: Logger;

  readonly #getAccountAssetByID: AssetsProvider['getAccountAssetByID'];

  readonly #getAccountAssetsByIDs: AssetsProvider['getAccountAssetsByIDs'];

  readonly #getAccountAssetsByScope: AssetsProvider['getAccountAssetsByScope'];

  readonly #findAccountById: AccountsService['findById'];

  readonly #getActiveNetworks: ConfigProvider['getActiveNetworks'];

  constructor(options: CoreAssetsAdapterOptions) {
    const {
      logger,
      getAccountAssetByID,
      getAccountAssetsByIDs,
      getAccountAssetsByScope,
      findAccountById,
      getActiveNetworks,
    } = options;

    this.#logger = logger.withPrefix('[🪙 CoreAssetsAdapter]');
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

  /**
   * Maps a controller asset without resolving token-account addresses.
   *
   * @param accountId - Keyring account ID.
   * @param accountAddress - Solana account address (owner).
   * @param asset - Asset returned by AssetsController.
   * @returns Mapped asset.
   */
  #mapAsset(
    accountId: string,
    accountAddress: string,
    asset: Asset,
  ): AssetEntity {
    return mapControllerAsset(accountId, accountAddress, asset);
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

    return this.#mapAsset(accountId, accountAddress, asset);
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

    const entries = assetIds.map((assetId) => {
      const asset = assets[assetId];
      return [
        assetId,
        asset ? this.#mapAsset(accountId, accountAddress, asset) : null,
      ] as const;
    });

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

    const mapped = Object.values(controllerAssets).map((asset) => {
      if (!asset) {
        return null;
      }
      return this.#mapAsset(accountId, accountAddress, asset as Asset);
    });

    return mapped.filter((asset): asset is AssetEntity => asset !== null);
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
}
