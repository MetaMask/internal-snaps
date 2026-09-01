import type { Asset } from '@metamask/assets-controller';
import { parseCaipAssetType } from '@metamask/utils';

import type { AssetEntity } from '../../../../entities';
import type {
  NativeCaipAssetType,
  Network,
  TokenCaipAssetType,
} from '../../../constants/solana';
import { SolanaCaip19Tokens } from '../../../constants/solana';
import { toTokenUnits } from '../../../utils/toTokenUnit';

/**
 * Maps an AssetsController asset to the Snap's {@link AssetEntity} shape.
 *
 * AssetsController returns balances in display format, so the source amount
 * is used directly as the UI amount and converted to raw token units. The
 * mapper does not derive token account addresses. Core-backed assets resolve
 * them lazily when transaction history is requested.
 *
 * Native SOL uses the account address. SPL tokens use the mint from the
 * CAIP-19 ID. Snap-fetched assets may also include their token account pubkey.
 *
 * @param accountId - Keyring account ID.
 * @param accountAddress - Solana account address (owner).
 * @param asset - Asset returned by AssetsController.
 * @param tokenAccountPubkey - Associated token account address, when already
 * known; ignored for native SOL.
 * @returns Mapped asset entity.
 */
export function mapControllerAsset(
  accountId: string,
  accountAddress: string,
  asset: Asset,
  tokenAccountPubkey?: string,
): AssetEntity {
  const assetId = asset.id;
  const { chainId, assetReference } = parseCaipAssetType(assetId);
  const decimals = asset.metadata.decimals ?? 0;
  const symbol = asset.metadata.symbol ?? 'UNKNOWN';
  const uiAmount = asset.balance.amount;
  const rawAmount = toTokenUnits(uiAmount, decimals).toString();
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
    ...(tokenAccountPubkey ? { pubkey: tokenAccountPubkey } : {}),
    symbol,
    decimals,
    rawAmount,
    uiAmount,
  };
}
