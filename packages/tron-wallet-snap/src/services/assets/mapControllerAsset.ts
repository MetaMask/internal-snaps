import type { Asset } from '@metamask/assets-controller';
import type { CaipAssetType } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import { Network, TokenMetadata } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import { toUiAmount } from '../../utils/conversion';

/**
 * Maps an AssetsController asset to the Snap's {@link AssetEntity} shape.
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
  const knownMetadata = TokenMetadata[assetId as keyof typeof TokenMetadata];
  const decimals = asset.metadata.decimals ?? knownMetadata?.decimals ?? 0;
  const symbol = asset.metadata.symbol ?? knownMetadata?.symbol ?? '';
  const iconUrl = asset.metadata.image ?? knownMetadata?.iconUrl ?? '';
  const { amount } = asset.balance;

  return {
    assetType: assetId,
    keyringAccountId: accountId,
    network: chainId as Network,
    symbol,
    decimals,
    rawAmount: amount,
    uiAmount: toUiAmount(amount, decimals).toString(),
    iconUrl,
  } as AssetEntity;
}
