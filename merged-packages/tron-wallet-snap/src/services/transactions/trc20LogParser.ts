import type { FungibleAssetMetadata } from '@metamask/snaps-sdk';
import { TronWeb } from 'tronweb';

import type { FullNodeTransactionInfo } from '../../clients/tron-http/types';
import type { ContractTransactionInfo } from '../../clients/trongrid/types';
import type { Network } from '../../constants';
import type { TokenCaipAssetType } from '../assets/types';

const UNKNOWN_TOKEN_SYMBOL = 'UNKNOWN';
const DEFAULT_TOKEN_DECIMALS = 9;

/**
 * keccak256("Transfer(address,address,uint256)") — the TRC20/ERC20 `Transfer`
 * event signature hash. Matched against a log's first topic to identify
 * fungible token transfers. Stored without the `0x` prefix to match the raw
 * topic encoding returned by the full node.
 */
export const TRC20_TRANSFER_EVENT_SIGNATURE =
  'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * A TRC20 transfer decoded from a transaction's event logs.
 */
export type ParsedTransferLog = {
  /** The transaction hash the transfer belongs to. */
  transactionId: string;
  /** The TRC20 token contract address (base58). */
  contractAddress: string;
  /** The sender address (base58). */
  from: string;
  /** The recipient address (base58). */
  to: string;
  /** The transferred amount in the token's smallest unit, as a decimal string. */
  value: string;
  /** The block timestamp (ms) of the parent transaction. */
  blockTimestamp: number;
};

type EventLog = NonNullable<FullNodeTransactionInfo['log']>[number];

/**
 * Removes a leading `0x` from a hex string, if present.
 *
 * @param value - The hex string.
 * @returns The hex string without a `0x` prefix.
 */
function stripHexPrefix(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

/**
 * Converts a 32-byte, left-padded event topic into a Tron base58 address.
 *
 * @param topic - The hex-encoded topic (with or without `0x`).
 * @returns The base58 address, or null when the topic is too short or cannot be converted.
 */
function topicToTronAddress(topic: string): string | null {
  const clean = stripHexPrefix(topic);
  if (clean.length < 40) {
    return null;
  }
  // Tron addresses are the trailing 20 bytes prefixed with the 0x41 network byte.
  try {
    return TronWeb.address.fromHex(`41${clean.slice(-40)}`);
  } catch {
    return null;
  }
}

/**
 * Converts a hex contract address (without the 0x41 prefix) to base58.
 *
 * @param addressHex - The 20-byte hex contract address (with or without `0x`).
 * @returns The base58 address, or null when it cannot be converted.
 */
function contractHexToTronAddress(addressHex: string): string | null {
  const clean = stripHexPrefix(addressHex);
  if (clean.length !== 40) {
    return null;
  }
  try {
    return TronWeb.address.fromHex(`41${clean}`);
  } catch {
    return null;
  }
}

/**
 * Decodes a hex data field into a decimal value string.
 *
 * @param data - The hex-encoded data field (with or without `0x`).
 * @returns The value as a decimal string, or null when it cannot be decoded.
 */
function dataToValue(data: string): string | null {
  const clean = stripHexPrefix(data);
  if (clean.length === 0) {
    return null;
  }
  try {
    return BigInt(`0x${clean}`).toString();
  } catch {
    return null;
  }
}

/**
 * Reconstructs TRC20 transfers from a confirmed transaction's event logs.
 *
 * Used as a fallback when TronGrid's address-level TRC20 endpoint has not yet
 * indexed a freshly-confirmed transaction's transfers, which would otherwise
 * cause a TRX->TRC20 swap to be misclassified as a plain TRX send.
 *
 * @param log - The event logs from the full node `getTransactionInfoById` response.
 * @param transactionId - The transaction hash the logs belong to.
 * @param blockTimestamp - The block timestamp (ms) of the transaction.
 * @returns The decoded TRC20 `Transfer` events. Non-transfer logs and malformed entries are skipped.
 */
export function parseTransferLogs(
  log: EventLog[] | undefined,
  transactionId: string,
  blockTimestamp: number,
): ParsedTransferLog[] {
  if (!log || log.length === 0) {
    return [];
  }

  const transfers: ParsedTransferLog[] = [];

  for (const entry of log) {
    const [signature, fromTopic, toTopic] = entry.topics ?? [];

    if (
      !signature ||
      stripHexPrefix(signature).toLowerCase() !== TRC20_TRANSFER_EVENT_SIGNATURE
    ) {
      continue;
    }

    // A TRC20 `Transfer` has exactly two indexed parameters (from, to).
    if (!fromTopic || !toTopic) {
      continue;
    }

    const contractAddress = contractHexToTronAddress(entry.address);
    const from = topicToTronAddress(fromTopic);
    const to = topicToTronAddress(toTopic);
    const value = dataToValue(entry.data);

    if (!contractAddress || !from || !to || value === null) {
      continue;
    }

    transfers.push({
      transactionId,
      contractAddress,
      from,
      to,
      value,
      blockTimestamp,
    });
  }

  return transfers;
}

/**
 * Builds the CAIP-19 asset type for a TRC20 token contract on a given network.
 *
 * @param scope - The network scope.
 * @param contractAddress - The TRC20 token contract address (base58).
 * @returns The CAIP-19 asset type (e.g. `tron:728126428/trc20:T...`).
 */
function toTrc20AssetType(
  scope: Network,
  contractAddress: string,
): TokenCaipAssetType {
  return `${scope}/trc20:${contractAddress}` as TokenCaipAssetType;
}

/**
 * Collects the unique TRC20 asset types referenced by the given transfers, so
 * their metadata (symbol, decimals) can be resolved in a single batch.
 *
 * @param transfers - The reconstructed transfers.
 * @param scope - The network scope.
 * @returns The unique CAIP-19 asset types.
 */
export function getReconstructedTransferAssetTypes(
  transfers: ParsedTransferLog[],
  scope: Network,
): TokenCaipAssetType[] {
  const assetTypes = new Set<TokenCaipAssetType>();
  for (const transfer of transfers) {
    assetTypes.add(toTrc20AssetType(scope, transfer.contractAddress));
  }
  return [...assetTypes];
}

/**
 * Converts log-reconstructed transfers into the same `ContractTransactionInfo`
 * shape that TronGrid's address-level TRC20 endpoint returns, resolving each
 * token's `token_info` from previously fetched metadata. Transfers whose
 * metadata is missing fall back to UNKNOWN symbol and default decimals.
 *
 * @param transfers - The reconstructed transfers.
 * @param scope - The network scope.
 * @param metadataByAssetType - Token metadata keyed by CAIP-19 asset type.
 * @returns The transfers as `ContractTransactionInfo` entries.
 */
export function buildContractTransactionInfos(
  transfers: ParsedTransferLog[],
  scope: Network,
  metadataByAssetType: Record<
    TokenCaipAssetType,
    FungibleAssetMetadata | null | undefined
  >,
): ContractTransactionInfo[] {
  return transfers.map((transfer) => {
    const assetType = toTrc20AssetType(scope, transfer.contractAddress);
    const metadata = metadataByAssetType[assetType];
    const unit = metadata?.units?.[0];

    return {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      transaction_id: transfer.transactionId,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      token_info: {
        symbol: metadata?.symbol ?? UNKNOWN_TOKEN_SYMBOL,
        address: transfer.contractAddress,
        decimals: unit?.decimals ?? DEFAULT_TOKEN_DECIMALS,
        name: metadata?.name ?? UNKNOWN_TOKEN_SYMBOL,
      },
      // eslint-disable-next-line @typescript-eslint/naming-convention
      block_timestamp: transfer.blockTimestamp,
      from: transfer.from,
      to: transfer.to,
      type: 'Transfer',
      value: transfer.value,
    };
  });
}
