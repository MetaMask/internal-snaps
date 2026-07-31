import type {
  AccountId,
  AssetsControllerGetAccountAssetByIDAction,
  AssetsControllerGetAccountAssetsByIDsAction,
  AssetsControllerGetAccountAssetsByScopeAction,
  Caip19AssetId,
} from '@metamask/assets-controller';
import type { CaipChainId } from '@metamask/utils';

import { AssetsServiceMessenger } from './messenger';

/**
 * Thin service that reads account assets from Core AssetsController via a
 * Snap messenger endowment.
 *
 * Does not handle snap-owned / protocol-specific assets.
 */
export class AssetsService {
  readonly #messenger: AssetsServiceMessenger;

  constructor({ messenger }: { messenger: AssetsServiceMessenger }) {
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
  ): Promise<ReturnType<AssetsControllerGetAccountAssetByIDAction['handler']>> {
    return this.#messenger.call(
      'AssetsController:getAccountAssetByID',
      accountId,
      assetId,
    );
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
  ): Promise<
    ReturnType<AssetsControllerGetAccountAssetsByIDsAction['handler']>
  > {
    if (assetIds.length === 0) {
      return {};
    }

    return this.#messenger.call(
      'AssetsController:getAccountAssetsByIDs',
      accountId,
      assetIds,
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
  ): Promise<
    ReturnType<AssetsControllerGetAccountAssetsByScopeAction['handler']>
  > {
    return this.#messenger.call(
      'AssetsController:getAccountAssetsByScope',
      accountId,
      scope,
    );
  }
}
