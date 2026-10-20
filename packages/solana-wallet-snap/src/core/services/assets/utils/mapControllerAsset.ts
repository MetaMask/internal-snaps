import type { Asset } from '@metamask/assets-controller';
import { parseCaipAssetType } from '@metamask/utils';

import type { AssetEntity, TokenAsset } from '../../../../entities';
import { assertSupportedNetwork } from '../../../constants/solana';
import type {
  NativeCaipAssetType,
  Network,
  TokenCaipAssetType,
} from '../../../constants/solana';
import { toRawAmount } from '../../../utils/conversion';

/**
 * Maps an AssetsController asset to the Snap's {@link AssetEntity} shape.
 *
 * The AssetsController returns balances in the asset's human-readable unit
 * (i.e. with decimals already applied, e.g. SOL rather than lamports), so the
 * source amount is used directly as the UI amount and the raw amount is
 * derived from it.
 *
 * @param accountId - Keyring account ID.
 * @param asset - Asset returned by AssetsController.
 * @param address - Owner wallet address, required to populate native assets.
 * @returns Mapped asset entity.
 */
export function mapControllerAsset(
  accountId: string,
  asset: Asset,
  address = '',
): AssetEntity {
  const assetId = asset.id;
  const network: Network = assertSupportedNetwork(asset.chainId);
  const decimals = asset.metadata.decimals ?? 0;
  const symbol = asset.metadata.symbol ?? '';
  const { amount } = asset.balance;
  const { assetNamespace, assetReference } = parseCaipAssetType(assetId);

  if (assetNamespace === 'slip44') {
    return {
      assetType: assetId as NativeCaipAssetType,
      keyringAccountId: accountId,
      network,
      address,
      symbol,
      decimals,
      rawAmount: toRawAmount(amount, decimals),
      uiAmount: amount,
    };
  }

  if (assetNamespace === 'token') {
    return {
      assetType: assetId as TokenCaipAssetType,
      keyringAccountId: accountId,
      network,
      mint: assetReference,
      symbol,
      decimals,
      rawAmount: toRawAmount(amount, decimals),
      uiAmount: amount,
    } as TokenAsset;
  }

  throw new Error(`Unsupported Solana asset namespace: "${assetNamespace}"`);
}
