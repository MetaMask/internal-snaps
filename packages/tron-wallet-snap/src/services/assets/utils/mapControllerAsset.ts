import type { Asset } from '@metamask/assets-controller';

import { Network } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';
import { toUiAmount } from '../../../utils/conversion';

/**
 * Maps an AssetsController asset to the Snap's {@link AssetEntity} shape.
 *
 * @param accountId - Keyring account ID.
 * @param asset - Asset returned by AssetsController.
 * @returns Mapped asset entity.
 */
export function mapControllerAsset(
  accountId: string,
  asset: Asset,
): AssetEntity {
  const assetId = asset.id;
  const decimals = asset.metadata.decimals ?? 0;
  const symbol = asset.metadata.symbol ?? '';
  const iconUrl = asset.metadata.image ?? '';
  const { amount } = asset.balance;

  return {
    assetType: assetId,
    keyringAccountId: accountId,
    network: asset.chainId as Network,
    symbol,
    decimals,
    rawAmount: amount,
    uiAmount: toUiAmount(amount, decimals).toString(),
    iconUrl,
  } as AssetEntity;
}
