import type {
  AccountId,
  Asset,
  Caip19AssetId,
} from '@metamask/assets-controller';
import type { CaipChainId } from '@metamask/utils';

import type { AssetsServiceMessengerCaller } from './messenger';
import type { AssetEntity } from './types';
import { mapControllerAsset } from './utils/mapControllerAsset';

/**
 * Thin service that reads account assets from Core AssetsController via a
 * Snap messenger endowment.
 *
 * Does not handle snap-owned / protocol-specific assets.
 */
export class AssetsService {
  readonly #messenger: AssetsServiceMessengerCaller;

  constructor({ messenger }: { messenger: AssetsServiceMessengerCaller }) {
    this.#messenger = messenger;
  }

  /**
   * Returns a single account asset by CAIP-19 ID, or `null` if missing.
   *
   * @param accountId - Keyring account ID.
   * @param assetId - CAIP-19 asset ID.
   * @returns Mapped asset, or `null`.
   */
  async getAccountAssetByID(
    accountId: AccountId,
    assetId: Caip19AssetId,
  ): Promise<AssetEntity | null> {
    const result = await this.#messenger.call(
      'AssetsController:getAccountAssetByID',
      accountId,
      assetId,
    );

    if (!result) {
      return null;
    }

    return mapControllerAsset(accountId, assetId, result);
  }

  /**
   * Returns account assets for the given CAIP-19 IDs, keyed by asset ID.
   * Missing assets are `null`.
   *
   * @param accountId - Keyring account ID.
   * @param assetIds - CAIP-19 asset IDs to resolve.
   * @returns Map of asset ID → mapped asset (or `null` when missing).
   */
  async getAccountAssetsByIDs(
    accountId: AccountId,
    assetIds: Caip19AssetId[],
  ): Promise<Record<Caip19AssetId, AssetEntity | null>> {
    if (assetIds.length === 0) {
      return {};
    }

    const controllerAssets = await this.#messenger.call(
      'AssetsController:getAccountAssetsByIDs',
      accountId,
      assetIds,
    );

    return Object.fromEntries(
      assetIds.map((assetId) => {
        const controllerAsset = controllerAssets[assetId];
        return [
          assetId,
          controllerAsset
            ? mapControllerAsset(accountId, assetId, controllerAsset)
            : null,
        ];
      }),
    ) as Record<Caip19AssetId, AssetEntity | null>;
  }

  /**
   * Returns all controller-backed assets for an account.
   *
   * @param scope - CAIP-2 chain ID to filter controller results.
   * @param accountId - Keyring account ID.
   * @returns Mapped assets present in controller state.
   */
  async getAccountAssetsByScope(
    scope: CaipChainId,
    accountId: AccountId,
  ): Promise<AssetEntity[]> {
    const controllerAssets = await this.#messenger.call(
      'AssetsController:getAccountAssetsByScope',
      accountId,
      scope,
    );

    return (Object.entries(controllerAssets) as [Caip19AssetId, Asset][]).map(
      ([assetId, asset]) => mapControllerAsset(accountId, assetId, asset),
    );
  }
}
