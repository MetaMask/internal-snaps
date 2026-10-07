import type {
  AccountId,
  AssetsControllerGetAccountAssetByIDAction,
  AssetsControllerGetAccountAssetsByIDsAction,
  AssetsControllerGetAccountAssetsByScopeAction,
  AssetsControllerGetAssetMetadataAction,
  AssetsControllerGetAssetsAction,
  Caip19AssetId,
} from '@metamask/assets-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Messenger } from '@metamask/messenger';
import { AsyncMessenger } from '@metamask/snaps-sdk';
import type { CaipChainId } from '@metamask/utils';

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
  | AssetsControllerGetAccountAssetsByScopeAction
  | AssetsControllerGetAssetMetadataAction
  | AssetsControllerGetAssetsAction;

/**
 * Messenger restricted to actions consumed by {@link AssetsProvider}.
 */
export type AssetsProviderMessenger = AsyncMessenger<
  Messenger<typeof ASSETS_PROVIDER_NAME, AssetsProviderAllowedActions>
>;

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

  /**
   * Returns metadata for a CAIP-19 asset from controller state, or `undefined`
   * if the asset is unknown.
   *
   * @param assetId - CAIP-19 asset ID.
   * @returns Controller asset metadata, or `undefined`.
   */
  async getAssetMetadata(
    assetId: Caip19AssetId,
  ): Promise<ReturnType<AssetsControllerGetAssetMetadataAction['handler']>> {
    return this.#messenger.call('AssetsController:getAssetMetadata', assetId);
  }

  /**
   * Fetches combined assets (balance + metadata + price + computed
   * `fiatValue`) for the given accounts, bypassing client-side caches.
   *
   * Unlike the state-only getters above, this maps to the controller's
   * one-time fetch pipeline: passing `forceUpdate: true` refreshes the data
   * from the data sources and updates controller state, and the returned
   * value reflects that fresh fetch rather than current state. Pass
   * `bypassServerCache: true` (only together with `forceUpdate`) to also
   * bypass server-side HTTP caches such as the Accounts API's 60-second
   * cache; use sparingly, e.g. right after a transaction confirms when the
   * cached snapshot is known stale.
   *
   * @param accounts - Internal accounts to fetch assets for.
   * @param options - Fetch options (`chainIds`, `forceUpdate`,
   * `bypassServerCache`, `dataTypes`, etc.).
   * @returns Combined assets keyed by account ID, then CAIP-19 asset ID.
   */
  async getAssets(
    accounts: InternalAccount[],
    options?: Parameters<AssetsControllerGetAssetsAction['handler']>[1],
  ): Promise<ReturnType<AssetsControllerGetAssetsAction['handler']>> {
    return this.#messenger.call(
      'AssetsController:getAssets',
      accounts,
      options,
    );
  }
}
