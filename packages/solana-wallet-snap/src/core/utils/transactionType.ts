import { TransactionType } from '@metamask/keyring-api';
import type { CaipAssetType } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import { METAMASK_ORIGIN } from '../constants/solana';

/**
 * Resolves the transaction classification to report for a lifecycle event.
 *
 * A classification is only trustworthy once a transaction has been mapped from
 * on-chain data, where the balance changes identify the direction. Before
 * broadcast the Snap only has the raw, unsigned transaction, and an arbitrary
 * dApp transaction cannot be classified from its instructions without guessing,
 * so those events report `unknown`.
 *
 * The one pre-broadcast case that is known is the unified send flow: it is the
 * only MetaMask-originated transaction the Snap itself builds, and it is always
 * a send. That holds for `signTransaction` as well as
 * `signAndSendTransaction`, so the origin alone decides it. The unified
 * swap/bridge flow is classified separately by {@link resolveFlowTransactionType}
 * from the source and destination asset ids.
 *
 * @param options - The classification inputs.
 * @param options.origin - The origin that triggered the lifecycle step.
 * @param options.transactionType - A classification already known by the caller, if any.
 * @returns The classification to report.
 */
export function resolveTransactionType({
  origin,
  transactionType,
}: {
  origin: string;
  transactionType?: TransactionType;
}): TransactionType {
  if (transactionType !== undefined) {
    return transactionType;
  }

  return origin === METAMASK_ORIGIN
    ? TransactionType.Send
    : TransactionType.Unknown;
}

/**
 * Resolves the unified swap/bridge classification from the swap asset ids.
 *
 * The unified swap/bridge flow passes the source and destination asset ids, so
 * a same-chain trade is a `swap` and a cross-chain trade is a `bridgeSend`.
 * When either asset id is missing or cannot be parsed the flow is unknown, and
 * the caller falls back to {@link resolveTransactionType}.
 *
 * @param options - The classification inputs.
 * @param options.sourceAssetId - The swap/bridge source asset id, when provided.
 * @param options.destAssetId - The swap/bridge destination asset id, when provided.
 * @returns The classification, or `undefined` when it cannot be determined.
 */
export function resolveFlowTransactionType({
  sourceAssetId,
  destAssetId,
}: {
  sourceAssetId?: CaipAssetType;
  destAssetId?: CaipAssetType;
}): TransactionType | undefined {
  if (sourceAssetId === undefined || destAssetId === undefined) {
    return undefined;
  }

  const isCrossChain = isCrossChainAssetPair(sourceAssetId, destAssetId);

  if (isCrossChain === undefined) {
    return undefined;
  }

  return isCrossChain ? TransactionType.BridgeSend : TransactionType.Swap;
}

/**
 * Compares the CAIP-2 chain of two CAIP-19 asset ids.
 *
 * @param sourceAssetId - The source asset id.
 * @param destAssetId - The destination asset id.
 * @returns True when the two assets live on different chains, or `undefined`
 * when either asset id cannot be parsed so the pair must not be trusted.
 */
function isCrossChainAssetPair(
  sourceAssetId: CaipAssetType,
  destAssetId: CaipAssetType,
): boolean | undefined {
  try {
    const { chainId: sourceChainId } = parseCaipAssetType(sourceAssetId);
    const { chainId: destChainId } = parseCaipAssetType(destAssetId);

    return sourceChainId !== destChainId;
  } catch {
    // An unparseable asset id means the pair cannot be trusted, so the caller
    // falls back to the origin-derived classification.
    return undefined;
  }
}
