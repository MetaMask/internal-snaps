import { TransactionType } from '@metamask/keyring-api';
import type { CaipAssetType } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';
import { Types as TronwebTypes } from 'tronweb';

/**
 * TRC20 function selectors, i.e. the first four bytes of the keccak-256 hash of
 * the function signature (`transfer(address,uint256)` and
 * `approve(address,uint256)`). The selector is the only signal available to
 * classify a smart-contract call before it is confirmed, since the raw data
 * carries no ABI at that stage.
 */
const TRC20_TRANSFER_SELECTOR = 'a9059cbb';
const TRC20_APPROVE_SELECTOR = '095ea7b3';

/**
 * Classifies an unsigned or broadcast Tron transaction from its raw data.
 *
 * The contract type is the only classification signal available before a
 * transaction is confirmed: the account-balance comparison that
 * `TransactionMapper` performs for confirmed transactions is not possible here,
 * and a smart-contract call carries no ABI at this stage. Every contract that
 * the Snap itself builds for a transfer or a staking operation is still
 * identifiable, and the rest fall back to `unknown` rather than guessing.
 *
 * @param rawData - The transaction raw data, or `undefined` when unavailable.
 * @returns The keyring-api transaction type.
 */
export function mapRawTransactionType(
  rawData: TronwebTypes.Transaction['raw_data'] | undefined,
): TransactionType {
  const contractType = rawData?.contract?.[0]?.type;

  switch (contractType) {
    case TronwebTypes.ContractType.TransferContract:
    case TronwebTypes.ContractType.TransferAssetContract:
      return TransactionType.Send;
    case TronwebTypes.ContractType.FreezeBalanceContract:
    case TronwebTypes.ContractType.FreezeBalanceV2Contract:
      return TransactionType.StakeDeposit;
    case TronwebTypes.ContractType.UnfreezeBalanceContract:
    case TronwebTypes.ContractType.UnfreezeBalanceV2Contract:
    case TronwebTypes.ContractType.WithdrawExpireUnfreezeContract:
      return TransactionType.StakeWithdraw;
    default:
      return TransactionType.Unknown;
  }
}

/**
 * Reads the smart-contract call data selector from a Tron transaction.
 *
 * @param rawData - The transaction raw data.
 * @returns The lowercased four-byte selector, or `undefined` when absent.
 */
function getContractDataSelector(
  rawData: TronwebTypes.Transaction['raw_data'] | undefined,
): string | undefined {
  const contractValue = rawData?.contract?.[0]?.parameter?.value as
    | { data?: unknown }
    | undefined;
  const callData = contractValue?.data;

  if (typeof callData !== 'string') {
    return undefined;
  }

  return callData.slice(0, 8).toLowerCase();
}

/**
 * Classifies a smart-contract call from its function selector.
 *
 * Only the calls the Snap itself understands are classified; everything else,
 * including DEX swaps and bridge deposits, stays `unknown` rather than
 * guessing.
 *
 * @param rawData - The transaction raw data.
 * @returns The keyring-api transaction type.
 */
function classifySmartContractCall(
  rawData: TronwebTypes.Transaction['raw_data'] | undefined,
): TransactionType {
  const selector = getContractDataSelector(rawData);

  switch (selector) {
    case TRC20_TRANSFER_SELECTOR:
      return TransactionType.Send;
    case TRC20_APPROVE_SELECTOR:
      return TransactionType.TokenApprove;
    default:
      return TransactionType.Unknown;
  }
}

/**
 * Resolves the analytics classification for a transaction.
 *
 * The unified swap/bridge flow passes the source and destination asset ids, so
 * a same-chain trade is a `swap` and a cross-chain trade is a `bridgeSend`.
 * When the asset ids are absent (unified send, dApp transactions) the
 * classification falls back to the contract type and, for smart-contract calls,
 * the function selector.
 *
 * @param options - The classification inputs.
 * @param options.rawData - The transaction raw data.
 * @param options.sourceAssetId - The swap/bridge source asset id, when provided.
 * @param options.destAssetId - The swap/bridge destination asset id, when provided.
 * @returns The keyring-api transaction type.
 */
export function resolveTransactionType({
  rawData,
  sourceAssetId,
  destAssetId,
}: {
  rawData: TronwebTypes.Transaction['raw_data'] | undefined;
  sourceAssetId?: CaipAssetType;
  destAssetId?: CaipAssetType;
}): TransactionType {
  const isCrossChain =
    sourceAssetId !== undefined && destAssetId !== undefined
      ? isCrossChainAssetPair(sourceAssetId, destAssetId)
      : undefined;

  if (isCrossChain !== undefined) {
    return isCrossChain ? TransactionType.BridgeSend : TransactionType.Swap;
  }

  const contractType = rawData?.contract?.[0]?.type;

  if (contractType === TronwebTypes.ContractType.TriggerSmartContract) {
    return classifySmartContractCall(rawData);
  }

  return mapRawTransactionType(rawData);
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
    // falls back to classifying the transaction itself.
    return undefined;
  }
}
