import type {
  AccountId,
  Asset,
  Caip19AssetId,
} from '@metamask/assets-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import type { CoreMessengerCaller } from '../../types/core-messenger';
import type { AssetEntity } from './types';
import { mapControllerAsset } from './utils/mapControllerAsset';

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
    accountId: AccountId,
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
   * Returns account assets for the given CAIP-19 IDs, keyed by asset ID.
   * Missing assets are `null`.
   *
   * @param accountId - Keyring account ID.
   * @param assetIds - CAIP-19 asset IDs to resolve.
   * @returns Map of asset ID → mapped asset (or `null` when missing).
   */
  async getAccountAssetsByIDs(
    accountId: AccountId,
    assetIds: string[],
  ): Promise<Record<string, AssetEntity | null>> {
    if (assetIds.length === 0) {
      return {};
    }

    /**
     * Get the unique chain IDs from the asset IDs.
     */
    const chainIds = [
      ...new Set(
        assetIds.map(
          (assetId) => parseCaipAssetType(assetId as CaipAssetType).chainId,
        ),
      ),
    ];

    const controllerAssets = await this.#coreMessenger.call(
      'AssetsController:getAssets',
      [{ id: accountId } as InternalAccount],
      { chainIds },
    );

    const accountAssets =
      (controllerAssets as Record<string, Record<string, Asset>>)[accountId] ??
      {};

    return Object.fromEntries(
      assetIds.map((assetId) => {
        const controllerAsset = accountAssets[assetId];
        return [
          assetId,
          controllerAsset
            ? mapControllerAsset(accountId, assetId, controllerAsset)
            : null,
        ];
      }),
    );
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
    const controllerAssets = await this.#coreMessenger.call(
      'AssetsController:getAssets',
      [{ id: accountId } as InternalAccount],
      { chainIds: [scope] },
    );

    const accountAssets =
      (controllerAssets as Record<string, Record<string, Asset>>)[accountId] ??
      {};

    return Object.entries(accountAssets).map(([assetId, asset]) =>
      mapControllerAsset(accountId, assetId, asset),
    );
  }
}
