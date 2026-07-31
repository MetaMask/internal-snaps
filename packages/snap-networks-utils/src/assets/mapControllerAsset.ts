import type { Asset } from '@metamask/assets-controller';
import type { CaipAssetType } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import { toUiAmount } from '../utils/toUiAmount';
import type { AssetEntity } from './types';

/**
 * Maps an AssetsController asset to the shared {@link AssetEntity} shape.
 *
 * @param accountId - Keyring account ID.
 * @param assetId - CAIP-19 asset ID.
 * @param asset - Asset returned by AssetsController.
 * @returns Mapped asset entity.
 */
export function mapControllerAsset(
  accountId: string,
  assetId: string,
  asset: Asset,
): AssetEntity {
  const { chainId } = parseCaipAssetType(assetId as CaipAssetType);
  const decimals = asset.metadata.decimals ?? 0;
  const symbol = asset.metadata.symbol ?? '';
  const iconUrl = asset.metadata.image ?? '';
  const { amount } = asset.balance;

  return {
    assetType: assetId,
    keyringAccountId: accountId,
    network: chainId,
    symbol,
    decimals,
    rawAmount: amount,
    uiAmount: toUiAmount(amount, decimals),
    iconUrl,
  };
}
