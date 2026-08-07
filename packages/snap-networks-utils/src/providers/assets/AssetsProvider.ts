import type {
  AccountId,
  AssetsControllerGetAccountAssetByIDAction,
  AssetsControllerGetAccountAssetsByIDsAction,
  AssetsControllerGetAccountAssetsByScopeAction,
  Caip19AssetId,
} from '@metamask/assets-controller';
import type { CaipChainId } from '@metamask/utils';

import type { MessengerCaller } from '../../types/messenger-caller';

/**
 * Namespace for the {@link AssetsProvider} messenger.
 */
export const ASSETS_PROVIDER_NAME = 'AssetsProvider' as const;

/**
 * Actions from other messengers that {@link AssetsProvider} calls.
 */
export type AssetsProviderAllowedActions =
  | AssetsControllerGetAccountAssetByIDAction
  | AssetsControllerGetAccountAssetsByIDsAction
  | AssetsControllerGetAccountAssetsByScopeAction;

/**
 * Messenger caller for actions consumed by {@link AssetsProvider}.
 *
 * Namespace-agnostic so a Snap Core `getMessenger` endowment (which uses the
 * Snap's own namespace and may expose additional actions) is assignable without
 * casts.
 */
export type AssetsProviderMessenger =
  MessengerCaller<AssetsProviderAllowedActions>;

export class AssetsProvider {
  readonly #messenger: AssetsProviderMessenger;

  constructor({ messenger }: { messenger: AssetsProviderMessenger }) {
    this.#messenger = messenger;
  }

  /**
   * Returns a single account asset by CAIP-19 ID, or `undefined` if missing.
   *
   * @param accountId - Keyring account ID.
   * @param assetId - CAIP-19 asset ID.
   * @returns Controller asset, or `undefined`.
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
   *
   * @param accountId - Keyring account ID.
   * @param assetIds - CAIP-19 asset IDs to resolve.
   * @returns Map of asset ID → controller asset.
   */
  async getAccountAssetsByIDs(
    accountId: AccountId,
    assetIds: Caip19AssetId[],
  ): Promise<
    ReturnType<AssetsControllerGetAccountAssetsByIDsAction['handler']>
  > {
    return this.#messenger.call(
      'AssetsController:getAccountAssetsByIDs',
      accountId,
      assetIds,
    );
  }

  /**
   * Returns controller-backed assets for an account on a chain.
   *
   * @param scope - CAIP-2 chain ID to filter controller results.
   * @param accountId - Keyring account ID.
   * @returns Controller assets keyed by CAIP-19 asset ID.
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
