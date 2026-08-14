import type { Asset } from '@metamask/assets-controller';
import { parseCaipAssetType } from '@metamask/utils';

import type { AssetEntity } from '../../../../entities';
import type {
  NativeCaipAssetType,
  Network,
  TokenCaipAssetType,
} from '../../../constants/solana';
import { SolanaCaip19Tokens } from '../../../constants/solana';
import { fromTokenUnits } from '../../../utils/fromTokenUnit';

/**
 * Maps an AssetsController asset to the Snap's {@link AssetEntity} shape.
 *
 * Native SOL uses the account address. SPL tokens use the mint from the
 * CAIP-19 ID. Associated token account (ATA) pubkeys are not derived here:
 * Core does not store them, Send already computes ATAs with the correct token
 * program, and Solana has no snap-owned assets that would need address
 * monitoring.
 *
 * @param accountId - Keyring account ID.
 * @param accountAddress - Solana account address (owner).
 * @param asset - Asset returned by AssetsController.
 * @returns Mapped asset entity.
 */
export function mapControllerAsset(
  accountId: string,
  accountAddress: string,
  asset: Asset,
): AssetEntity {
  const assetId = asset.id;
  const { chainId, assetReference } = parseCaipAssetType(assetId);
  const decimals = asset.metadata.decimals ?? 0;
  const symbol = asset.metadata.symbol ?? 'UNKNOWN';
  const rawAmount = asset.balance.amount;
  const uiAmount = fromTokenUnits(rawAmount, decimals);
  const network = chainId as Network;

  if (assetId.endsWith(SolanaCaip19Tokens.SOL)) {
    return {
      assetType: assetId as NativeCaipAssetType,
      keyringAccountId: accountId,
      network,
      address: accountAddress,
      symbol,
      decimals,
      rawAmount,
      uiAmount,
    };
  }

  return {
    assetType: assetId as TokenCaipAssetType,
    keyringAccountId: accountId,
    network,
    mint: assetReference,
    symbol,
    decimals,
    rawAmount,
    uiAmount,
  };
}
