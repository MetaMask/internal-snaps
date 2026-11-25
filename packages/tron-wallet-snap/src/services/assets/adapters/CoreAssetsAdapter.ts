import type { Asset, Caip19AssetId } from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import type { AssetsProvider } from '@metamask/snap-networks-utils';
import { Logger } from '@metamask/snap-networks-utils';

import { Network, SNAP_OWNED_ASSETS } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';
import {
  extractScopesFromAssetIds,
  parseTronCaipAssetType,
} from '../../../utils/caip';
import logger from '../../../utils/logger';
import { AssetFetchError } from '../errors';
import { extractSpecialAssetsFromMetadata } from '../utils/extractSpecialAssetsFromMetadata';
import { mapControllerAsset } from '../utils/mapControllerAsset';
import { toInternalAccount } from '../utils/toInternalAccount';

export type CoreAssetsAdapterOptions = {
  getAccountAssetByID: AssetsProvider['getAccountAssetByID'];
  getAccountAssetsByIDs: AssetsProvider['getAccountAssetsByIDs'];
  getAccountAssetsByScope: AssetsProvider['getAccountAssetsByScope'];
  getAssets: AssetsProvider['getAssets'];
};

/**
 * Reads assets through the AssetsController. Assets are fetched and published
 * by the controller once the assets migration is active. Tron resources and
 * staking positions are exposed in the TRX asset's balance metadata, so the
 * adapter derives the special assets from there when callers ask for them.
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

  /**
   * Adds the TRX asset for any requested special asset, so its balance
   * metadata can be used to derive the requested value.
   *
   * @param assetIds - Requested CAIP-19 asset IDs.
   * @returns Additional native asset IDs to fetch.
   */
  #getNativeAssetIds(assetIds: Caip19AssetId[]): Caip19AssetId[] {
    const nativeAssetIds = assetIds
      .filter((assetId) => SNAP_OWNED_ASSETS.includes(assetId))
      .map(
        (assetId) =>
          `${parseTronCaipAssetType(assetId).chainId}/slip44:195` as Caip19AssetId,
      );

    return [...new Set(nativeAssetIds)].filter(
      (nativeAssetId) => !assetIds.includes(nativeAssetId),
    );
  }

  async getAccountAssetByID(
    accountId: string,
    assetId: Caip19AssetId,
  ): Promise<AssetEntity | null> {
    this.#logger.info('Getting account asset by ID', { accountId, assetId });

    if (SNAP_OWNED_ASSETS.includes(assetId)) {
      const [asset] = await this.getAccountAssetsByIDs(accountId, [assetId]);
      return asset ?? null;
    }

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

    const assets = await this.#getAccountAssetsByIDs(accountId, [
      ...assetIds,
      ...this.#getNativeAssetIds(assetIds),
    ]);
    const assetsById = new Map<Caip19AssetId, AssetEntity>(
      Object.values(assets).map((asset) => [
        asset.id,
        mapControllerAsset(accountId, asset),
      ]),
    );

    for (const [assetId, asset] of extractSpecialAssetsFromMetadata({
      accountId,
      assets: Object.values(assets),
    })) {
      assetsById.set(assetId, asset);
    }

    return assetIds.map((assetId) => assetsById.get(assetId) ?? null);
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
   * The controller's one-time fetch pipeline (`AssetsController:getAssets`
   * with `forceUpdate` and `bypassServerCache`) provides the fresh TRX balance
   * metadata, from which the requested special assets are derived.
   *
   * @param account - The keyring account to fetch assets for.
   * @param assetIds - CAIP-19 asset IDs to resolve fresh values for.
   * @throws {@link AssetFetchError} When the controller fetch fails.
   * @returns Assets keyed in the same order as the requested asset IDs, with
   * `null` for asset IDs that could not be resolved.
   */
  async fetchAccountAssetsByIDs(
    account: KeyringAccount,
    assetIds: Caip19AssetId[],
  ): Promise<(AssetEntity | null)[]> {
    const scopes = extractScopesFromAssetIds(assetIds);

    const controllerAssets = await this.#getAssets(
      [{ ...toInternalAccount(account), scopes }],
      {
        chainIds: scopes,
        forceUpdate: true,
        bypassServerCache: true,
      },
    ).catch((error: unknown) => {
      throw error instanceof AssetFetchError
        ? error
        : new AssetFetchError(
            'Failed to fetch assets via the AssetsController',
            { cause: error },
          );
    });

    const assets = Object.values(controllerAssets[account.id] ?? {});
    const assetsById = new Map<Caip19AssetId, AssetEntity>(
      assets.map((asset) => [asset.id, mapControllerAsset(account.id, asset)]),
    );

    for (const [assetId, asset] of extractSpecialAssetsFromMetadata({
      accountId: account.id,
      assets,
    })) {
      assetsById.set(assetId, asset);
    }

    return assetIds.map((assetId) => assetsById.get(assetId) ?? null);
  }

  /**
   * Fetches a single fresh asset for the given asset ID.
   *
   * @param account - The keyring account to fetch the asset for.
   * @param assetId - CAIP-19 asset ID to resolve a fresh value for.
   * @returns The fresh asset, or `null` if it could not be resolved.
   */
  async fetchAccountAssetByID(
    account: KeyringAccount,
    assetId: Caip19AssetId,
  ): Promise<AssetEntity | null> {
    const [asset] = await this.fetchAccountAssetsByIDs(account, [assetId]);
    return asset ?? null;
  }
}
