import type { Asset, Caip19AssetId, AssetMetadata } from '@metamask/assets-controller';
import type { AssetsProvider, Logger } from '@metamask/snap-networks-utils';

import { KnownCaip2ChainId } from '../../../api';

export type CoreAssetsAdapterOptions = {
  logger: Logger;
  getAccountAssetByID: AssetsProvider['getAccountAssetByID'];
  getAccountAssetsByIDs: AssetsProvider['getAccountAssetsByIDs'];
  getAccountAssetsByScope: AssetsProvider['getAccountAssetsByScope'];
  getAssetMetadata: AssetsProvider['getAssetMetadata'];
};

/**
 * Reads fungible holdings and metadata from AssetsController.
 *
 * Account holdings are returned as controller {@link Asset} rows.
 * {@link AssetsService} validates them into the Stellar shape.
 */
export class CoreAssetsAdapter {
  readonly #logger: Logger;

  readonly #getAccountAssetByID: AssetsProvider['getAccountAssetByID'];

  readonly #getAccountAssetsByIDs: AssetsProvider['getAccountAssetsByIDs'];

  readonly #getAccountAssetsByScope: AssetsProvider['getAccountAssetsByScope'];

  readonly #getAssetMetadata: AssetsProvider['getAssetMetadata'];

  constructor(options: CoreAssetsAdapterOptions) {
    const {
      logger,
      getAccountAssetByID,
      getAccountAssetsByIDs,
      getAccountAssetsByScope,
      getAssetMetadata,
    } = options;

    this.#logger = logger.withPrefix('[CoreAssetsAdapter]');
    this.#getAccountAssetByID = getAccountAssetByID;
    this.#getAccountAssetsByIDs = getAccountAssetsByIDs;
    this.#getAccountAssetsByScope = getAccountAssetsByScope;
    this.#getAssetMetadata = getAssetMetadata;
  }

  async getAccountAssetByID(
    accountId: string,
    assetId: Caip19AssetId,
  ): Promise<Asset | null> {
    this.#logger.debug('Getting account asset by ID', { accountId, assetId });
    const asset = await this.#getAccountAssetByID(accountId, assetId);

    return asset ?? null;
  }

  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: Caip19AssetId[],
  ): Promise<(Asset | null)[]> {
    this.#logger.debug('Getting account assets by IDs', {
      accountId,
      assetIds,
    });
    const assets = await this.#getAccountAssetsByIDs(accountId, assetIds);

    return assetIds.map((assetId) => assets[assetId] ?? null);
  }

  async getAccountAssetsByScope(
    scope: KnownCaip2ChainId,
    accountId: string,
  ): Promise<Asset[]> {
    this.#logger.debug('Getting account assets by scope', {
      scope,
      accountId,
    });
    const controllerAssets = await this.#getAccountAssetsByScope(
      scope,
      accountId,
    );

    return Object.values(controllerAssets);
  }

  async getAccountAssets(accountId: string): Promise<Asset[]> {
    const [mainnetAssets, testnetAssets] = await Promise.all([
      this.getAccountAssetsByScope(KnownCaip2ChainId.Mainnet, accountId),
      this.getAccountAssetsByScope(KnownCaip2ChainId.Testnet, accountId),
    ]);

    return [...mainnetAssets, ...testnetAssets];
  }

  async getAssetMetadata(
    assetId: Caip19AssetId,
  ): Promise<AssetMetadata | null> {
    this.#logger.debug('Getting asset metadata', { assetId });
    const metadata = await this.#getAssetMetadata(assetId);

    if (!metadata) {
      return null;
    }

    return metadata;
  }
}
