import { TransactionType } from '@metamask/keyring-api';
import type { CaipAssetType } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

/**
 * Resolves the transaction type for a unified swap or bridge flow.
 *
 * @param options - The source and destination asset ids.
 * @param options.sourceAssetId - The source asset id.
 * @param options.destAssetId - The destination asset id.
 * @returns `swap` for assets on the same chain, `bridgeSend` for assets on
 * different chains, or `undefined` when either asset id is missing or invalid.
 */
export function resolveUnifiedSwapTransactionType({
  sourceAssetId,
  destAssetId,
}: {
  sourceAssetId?: CaipAssetType;
  destAssetId?: CaipAssetType;
}): TransactionType | undefined {
  if (sourceAssetId === undefined || destAssetId === undefined) {
    return undefined;
  }

  try {
    const { chainId: sourceChainId } = parseCaipAssetType(sourceAssetId);
    const { chainId: destChainId } = parseCaipAssetType(destAssetId);

    return sourceChainId === destChainId
      ? TransactionType.Swap
      : TransactionType.BridgeSend;
  } catch {
    return undefined;
  }
}

export const resolveFlowTransactionType = resolveUnifiedSwapTransactionType;
