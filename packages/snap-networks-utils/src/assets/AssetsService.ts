import type { Asset, Caip19AssetId } from '@metamask/assets-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import type { CoreMessengerCaller } from '../types/core-messenger';
import { mapControllerAsset } from './mapControllerAsset';
import type { AssetEntity } from './types';

export type GetAccountAssetsOptions = {
  /** Optional CAIP-2 chain IDs to filter controller results. */
  chainIds?: CaipChainId[];
};

/**
 * Thin service that reads account assets from Core AssetsController via a
 * Snap messenger endowment.
 *
 * Does not handle snap-owned / protocol-specific assets.
 */
export class AssetsService {
  readonly #coreMessenger: CoreMessengerCaller;

  constructor({ coreMessenger }: { coreMessenger: CoreMessengerCaller }) {
    this.#coreMessenger = coreMessenger;
  }

  /**
   * Returns a single account asset by CAIP-19 ID, or `null` if missing.
   *
   * @param accountId - Keyring account ID.
   * @param assetId - CAIP-19 asset ID.
   * @returns Mapped asset, or `null`.
   */
  async getAccountAssetByID(
    accountId: string,
    assetId: string,
  ): Promise<AssetEntity | null> {
    const result = await this.#coreMessenger.call(
      'AssetsController:getAsset',
      accountId,
      assetId as Caip19AssetId,
    );

    if (!result) {
      return null;
    }

    return mapControllerAsset(accountId, assetId, result);
  }

  /**
   * Returns account assets for the given CAIP-19 IDs, preserving request order.
   * Missing assets are `null`.
   *
   * @param accountId - Keyring account ID.
   * @param assetIds - CAIP-19 asset IDs to resolve.
   * @returns Mapped assets (or `null`) in the same order as `assetIds`.
   */
  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: string[],
  ): Promise<(AssetEntity | null)[]> {
    if (assetIds.length === 0) {
      return [];
    }

    const chainIds = [
      ...new Set(
        assetIds.map(
          (assetId) => parseCaipAssetType(assetId as CaipAssetType).chainId,
        ),
      ),
    ];

    const controllerAssets = await this.#coreMessenger.call(
      'AssetsController:getAssets',
      [{ id: accountId }] as unknown as InternalAccount[],
      { chainIds },
    );

    const accountAssets =
      (controllerAssets as Record<string, Record<string, Asset>>)[accountId] ??
      {};

    return assetIds.map((assetId) => {
      const controllerAsset = accountAssets[assetId];
      return controllerAsset
        ? mapControllerAsset(accountId, assetId, controllerAsset)
        : null;
    });
  }

  /**
   * Returns all controller-backed assets for an account.
   *
   * @param accountId - Keyring account ID.
   * @param options - Optional chain filter.
   * @returns Mapped assets present in controller state.
   */
  async getAccountAssets(
    accountId: string,
    options: GetAccountAssetsOptions = {},
  ): Promise<AssetEntity[]> {
    const controllerAssets = await this.#coreMessenger.call(
      'AssetsController:getAssets',
      [{ id: accountId }] as unknown as InternalAccount[],
      options.chainIds ? { chainIds: options.chainIds } : undefined,
    );

    const accountAssets =
      (controllerAssets as Record<string, Record<string, Asset>>)[accountId] ??
      {};

    return Object.entries(accountAssets).map(([assetId, asset]) =>
      mapControllerAsset(accountId, assetId, asset),
    );
  }
}
