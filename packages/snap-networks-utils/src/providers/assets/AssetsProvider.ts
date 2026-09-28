import type {
  AccountId,
  AssetsControllerGetAccountAssetByIDAction,
  AssetsControllerGetAccountAssetsByIDsAction,
  AssetsControllerGetAccountAssetsByScopeAction,
  AssetsControllerGetAssetsAction,
  Caip19AssetId,
} from '@metamask/assets-controller' with { 'resolution-mode': 'import' };
import type { Messenger } from '@metamask/messenger';
import { AsyncMessenger } from '@metamask/snaps-sdk';
import type { CaipChainId } from '@metamask/utils';

/**
 * Namespace for the {@link AssetsProvider} messenger.
 */
export const ASSETS_PROVIDER_NAME = 'AssetsProvider' as const;

type GetAssetsParameters = Parameters<
  AssetsControllerGetAssetsAction['handler']
>;

/**
 * Accounts accepted by {@link AssetsProvider.getAssets}, as expected by the
 * host `AssetsController`.
 */
export type GetAssetsAccounts = GetAssetsParameters[0];

/**
 * Options accepted by {@link AssetsProvider.getAssets}.
 *
 * This is the host's own `AssetsController:getAssets` options, so it supports
 * `bypassServerCache` to fetch the most up-to-date data, for example the TRX
 * asset and its metadata straight after it changes on chain.
 */
export type GetAssetsOptions = NonNullable<GetAssetsParameters[1]>;

/**
 * Assets returned by {@link AssetsProvider.getAssets}, keyed by account ID and
 * then by CAIP-19 asset ID.
 */
export type GetAssetsResult = Awaited<
  ReturnType<AssetsControllerGetAssetsAction['handler']>
>;

/**
 * Actions from other messengers that {@link AssetsProvider} calls.
 */
export type AssetsProviderAllowedActions =
  | AssetsControllerGetAccountAssetByIDAction
  | AssetsControllerGetAccountAssetsByIDsAction
  | AssetsControllerGetAccountAssetsByScopeAction
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
   * Fetches combined assets (balance + metadata + price + computed
   * `fiatValue`) for the given accounts, keyed by account ID and then by
   * CAIP-19 asset ID.
   *
   * Unlike the other reads on this provider, this one can trigger a request to
   * the host's data sources when a forced update is requested. Pass
   * `bypassServerCache: true` to also skip the Accounts API's server-side
   * cache, so the returned data is the most up-to-date available.
   *
   * @param accounts - Host accounts to fetch assets for.
   * @param options - Fetch options forwarded to the host.
   * @param options.bypassServerCache - Whether to skip the host's server-side
   * caches. Implies `forceUpdate: true`.
   * @returns Assets keyed by account ID and then by CAIP-19 asset ID.
   */
  async getAssets(
    accounts: GetAssetsAccounts,
    options?: GetAssetsOptions,
  ): Promise<GetAssetsResult> {
    const { bypassServerCache, ...hostOptions } = options ?? {};

    return this.#messenger.call('AssetsController:getAssets', accounts, {
      ...hostOptions,
      // The host only documents `bypassServerCache` as meaningful alongside
      // `forceUpdate`, and only contacts its data sources at all when it is
      // forced to. So an explicit `forceUpdate: false` cannot be honoured
      // together with the bypass: the bypass wins.
      forceUpdate: bypassServerCache ? true : hostOptions.forceUpdate,
      bypassServerCache,
    });
  }
}
