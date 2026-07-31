import type { AccountId, Asset, Caip19AssetId } from '@metamask/assets-controller';
import { parseCaipAssetType } from '@metamask/utils';

import { toUiAmount } from '../../../utils/toUiAmount';
import type { AssetEntity } from '../types';

/**
 * Maps an AssetsController asset to the shared {@link AssetEntity} shape.
 *
 * @param accountId - Keyring account ID.
 * @param assetId - CAIP-19 asset ID.
 * @param asset - Asset returned by AssetsController.
 * @returns Mapped asset entity.
 */
export function mapControllerAsset(
  accountId: AccountId,
  assetId: Caip19AssetId,
  asset: Asset,
): AssetEntity {
  const { chainId } = parseCaipAssetType(assetId);
  const { symbol, decimals, image } = asset.metadata;
  const iconUrl = image ?? '';
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
