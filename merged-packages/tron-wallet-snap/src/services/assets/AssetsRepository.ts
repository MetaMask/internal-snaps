import { cloneDeep } from 'lodash';

import type { AssetEntity } from '../../entities/assets';
import type { IStateManager } from '../state/IStateManager';
import type { UnencryptedStateValue } from '../state/State';

export class AssetsRepository {
  readonly #state: IStateManager<UnencryptedStateValue>;

  constructor(state: IStateManager<UnencryptedStateValue>) {
    this.#state = state;
  }

  async getByAccountId(keyringAccountId: string): Promise<AssetEntity[]> {
    const assets = await this.#state.getKey<AssetEntity[]>(
      `assets.${keyringAccountId}`,
    );

    return assets ?? [];
  }

  async getByAccountIdAndAssetType(
    keyringAccountId: string,
    assetType: string,
  ): Promise<AssetEntity | null> {
    const assets = await this.getByAccountId(keyringAccountId);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    return assets.find((asset) => asset.assetType === assetType) ?? null;
  }

  async getAll(): Promise<AssetEntity[]> {
    const assetsByAccount =
      (await this.#state.getKey<UnencryptedStateValue['assets']>('assets')) ??
      {};

    return Object.values(assetsByAccount).flat();
  }

  async saveMany(assets: AssetEntity[]): Promise<void> {
    // Update the state atomically
    await this.#state.update((stateValue) => {
      const newState = cloneDeep(stateValue);
      for (const asset of assets) {
        const { keyringAccountId } = asset;
        const accountAssets = cloneDeep(
          newState.assets[keyringAccountId] ?? [],
        );

        // Avoid duplicates. If same asset is already saved, override it.
        const existingAssetIndex = accountAssets.findIndex(
          (item) =>
            item.assetType === asset.assetType &&
            item.keyringAccountId === asset.keyringAccountId,
        );

        if (existingAssetIndex === -1) {
          accountAssets.push(asset);
        } else {
          accountAssets[existingAssetIndex] = asset;
        }

        newState.assets[keyringAccountId] = accountAssets;
      }
      return newState;
    });
  }
}
