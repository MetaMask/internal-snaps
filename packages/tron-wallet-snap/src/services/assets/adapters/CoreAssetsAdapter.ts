import type {
  AccountId,
  Asset,
  Caip19AssetId,
} from '@metamask/assets-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import type { Network } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';
import type { CoreMessengerCaller } from '../../../types/core-messenger';
import { mapControllerAsset } from '../mapControllerAsset';

/**
 * Reads account assets from Core AssetsController via the Snap messenger endowment.
 */
export class CoreAssetsAdapter {
  readonly #coreMessenger: CoreMessengerCaller;

  constructor({ coreMessenger }: { coreMessenger: CoreMessengerCaller }) {
    this.#coreMessenger = coreMessenger;
  }

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

  async getAccountAssetsByIDs(
    accountId: AccountId,
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

  async getAccountAssetsByScope(
    scope: Network,
    accountId: AccountId,
  ): Promise<AssetEntity[]> {
    const controllerAssets = await this.#coreMessenger.call(
      'AssetsController:getAssets',
      [{ id: accountId } as InternalAccount],
      { chainIds: [scope as CaipChainId] },
    );

    const accountAssets =
      (controllerAssets as Record<string, Record<string, Asset>>)[accountId] ??
      {};

    return Object.entries(accountAssets).map(([assetId, asset]) =>
      mapControllerAsset(accountId, assetId, asset),
    );
  }
}
