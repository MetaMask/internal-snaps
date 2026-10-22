import type { Asset, Caip19AssetId } from '@metamask/assets-controller';
import type { AssetsProvider, Logger } from '@metamask/snap-networks-utils';
import type { CaipChainId } from '@metamask/utils';

import type { AssetEntity } from '../../../../entities';
import { Network } from '../../../constants/solana';
import logger from '../../../utils/logger';
import { mapControllerAsset } from '../utils/mapControllerAsset';

export type CoreAssetsAdapterOptions = {
  getAccountAssetByID: AssetsProvider['getAccountAssetByID'];
  getAccountAssetsByIDs: AssetsProvider['getAccountAssetsByIDs'];
  getAccountAssetsByScope: AssetsProvider['getAccountAssetsByScope'];
};

/**
 * Reads assets through the AssetsController. Solana assets are ingested and
 * kept up to date by the controller once the assets migration is active.
 */
export class CoreAssetsAdapter {
  readonly #logger: Logger;

  readonly #getAccountAssetByID: AssetsProvider['getAccountAssetByID'];

  readonly #getAccountAssetsByIDs: AssetsProvider['getAccountAssetsByIDs'];

  readonly #getAccountAssetsByScope: AssetsProvider['getAccountAssetsByScope'];

  constructor(options: CoreAssetsAdapterOptions) {
    const {
      getAccountAssetByID,
      getAccountAssetsByIDs,
      getAccountAssetsByScope,
    } = options;

    this.#logger = logger.withPrefix('[CoreAssetsAdapter]');
    this.#getAccountAssetByID = getAccountAssetByID;
    this.#getAccountAssetsByIDs = getAccountAssetsByIDs;
    this.#getAccountAssetsByScope = getAccountAssetsByScope;
  }

  /**
   * Returns a single account asset by CAIP-19 ID, or `null` if missing.
   *
   * @param accountId - Keyring account ID.
   * @param assetId - CAIP-19 asset ID.
   * @returns The mapped asset, or `null`.
   */
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

  /**
   * Returns account assets for the given CAIP-19 IDs, in request order, with
   * `null` for asset IDs the controller could not resolve.
   *
   * @param accountId - Keyring account ID.
   * @param assetIds - CAIP-19 asset IDs to resolve.
   * @returns Mapped assets in request order, `null` when unresolved.
   */
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

  /**
   * Returns controller-backed assets for an account on the given Solana scope.
   *
   * @param scope - CAIP-2 chain ID to filter results.
   * @param accountId - Keyring account ID.
   * @returns Mapped assets for the scope.
   */
  async getAccountAssetsByScope(
    scope: CaipChainId,
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

  /**
   * Returns assets for an account across all Solana scopes.
   *
   * shortcut: only Mainnet is enabled in production today; Devnet is
   * enumerated for symmetry, upgrade when the enabled networks are
   * configurable through constants.
   *
   * @param accountId - Keyring account ID.
   * @returns Mapped assets across all Solana scopes.
   */
  async getAccountAssets(accountId: string): Promise<AssetEntity[]> {
    const [mainnetAssets, devnetAssets] = await Promise.all([
      this.getAccountAssetsByScope(Network.Mainnet, accountId),
      this.getAccountAssetsByScope(Network.Devnet, accountId),
    ]);

    return [...mainnetAssets, ...devnetAssets];
  }
}
