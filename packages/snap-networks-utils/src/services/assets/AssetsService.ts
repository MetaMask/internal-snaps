import type { Asset, Caip19AssetId } from '@metamask/assets-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';
import { assert, parseCaipAssetType } from '@metamask/utils';

import type { CoreMessengerCaller } from '../../types/core-messenger';
import { mapControllerAsset } from './mapControllerAsset';
import type { AssetEntity, AssetScope } from './types';

/**
 * Builds the account reference AssetsController expects for ID-keyed lookups.
 *
 * The controller indexes primarily by `account.id` for these read paths; the
 * remaining {@link InternalAccount} fields are supplied by Core when it has
 * them. We assert a non-empty ID, then narrow to {@link InternalAccount}.
 *
 * @param accountId - Keyring account ID.
 * @returns Account reference for AssetsController calls.
 */
function toInternalAccountRef(accountId: string): InternalAccount {
  assert(accountId.length > 0, 'Account ID must be a non-empty string');

  // AssetsController:getAssets indexes by account.id for these read paths.
  return { id: accountId } as InternalAccount;
}

/**
 * Normalizes a single scope or list of scopes to a chain-ID array.
 *
 * @param scope - Optional CAIP-2 chain filter.
 * @returns Chain IDs, or `undefined` when no filter is provided.
 */
function toChainIds(scope?: AssetScope): CaipChainId[] | undefined {
  if (scope === undefined) {
    return undefined;
  }

  if (typeof scope === 'string') {
    return [scope];
  }

  return [...scope];
}

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
   * Returns account assets for the given CAIP-19 IDs, keyed by asset ID.
   * Missing assets are `null`.
   *
   * @param accountId - Keyring account ID.
   * @param assetIds - CAIP-19 asset IDs to resolve.
   * @returns Map of asset ID → mapped asset (or `null` when missing).
   */
  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: string[],
  ): Promise<Record<string, AssetEntity | null>> {
    if (assetIds.length === 0) {
      return {};
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
      [toInternalAccountRef(accountId)],
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
   * @param accountId - Keyring account ID.
   * @param scope - Optional CAIP-2 chain ID(s) to filter controller results.
   * @returns Mapped assets present in controller state.
   */
  async getAccountAssets(
    accountId: string,
    scope?: AssetScope,
  ): Promise<AssetEntity[]> {
    const chainIds = toChainIds(scope);
    const controllerAssets = await this.#coreMessenger.call(
      'AssetsController:getAssets',
      [toInternalAccountRef(accountId)],
      chainIds ? { chainIds } : undefined,
    );

    const accountAssets =
      (controllerAssets as Record<string, Record<string, Asset>>)[accountId] ??
      {};

    return Object.entries(accountAssets).map(([assetId, asset]) =>
      mapControllerAsset(accountId, assetId, asset),
    );
  }
}
