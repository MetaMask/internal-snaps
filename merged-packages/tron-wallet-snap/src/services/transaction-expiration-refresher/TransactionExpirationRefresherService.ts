/* eslint-disable @typescript-eslint/naming-convention */
import { bytesToHex, hexToBytes, sha256 } from '@metamask/utils';
import type { TronWeb, Types } from 'tronweb';
import type { Block } from 'tronweb/lib/esm/types/APIResponse';

import type {
  HasFreshExpirationMetadataParams,
  HasFreshExpirationMetadataResult,
  TransactionRawData,
  TransactionRawDataWithExpirationMetadata,
  TransactionWithMetadata,
} from './types';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import type { Network } from '../../constants';

/**
 * TRON block time is 3 seconds, so refresh if expiration is within the
 * documented 1-3 block interval window.
 * https://developers.tron.network/docs/create-offline-transactions-with-trident-and-tronweb#block-related-field-descriptions
 */
export const TRANSACTION_METADATA_EXPIRATION_BUFFER_MS = 9_000;
export const TRANSACTION_METADATA_REFRESH_ERROR =
  'Unable to refresh transaction metadata before signing. Please rebuild the transaction and try again.';

/**
 * TRON TAPOS reference blocks are valid within the latest 65,536 blocks.
 * https://developers.tron.network/docs/tron-protocol-transaction
 */
const REFERENCE_BLOCK_WINDOW = 65_536;

/**
 * Match TronWeb's getCurrentRefBlockParams default: block timestamp + 60s.
 * https://github.com/tronprotocol/tronweb/blob/v6.1.0/src/lib/trx.ts#L1497-L1499
 */
const DEFAULT_EXPIRATION_MS = 60_000;
const MAX_EXPIRATION_MS = 24 * 60 * 60 * 1000;

/**
 * Refreshes transaction expiration and TAPOS metadata for:
 * - Full unsigned transactions that are about to be signed.
 * - raw_data objects stored in send-confirmation UI context for rescans.
 * - Serialized rawDataHex transactions stored in sign-transaction UI context.
 */
export class TransactionExpirationRefresherService {
  readonly #tronWebFactory: TronWebFactory;

  constructor({ tronWebFactory }: { tronWebFactory: TronWebFactory }) {
    this.#tronWebFactory = tronWebFactory;
  }

  /**
   * Ensures serialized TRON transaction raw data has fresh TAPOS and expiration
   * metadata, returning the transaction fields needed by confirmation scans.
   *
   * @param params - Refresh inputs.
   * @param params.scope - Network scope used to create a TronWeb client.
   * @param params.type - Serialized transaction contract type.
   * @param params.rawDataHex - Serialized transaction raw data.
   * @returns Transaction metadata built from the serialized raw data.
   */
  async ensureFreshSerializedTransaction({
    scope,
    type,
    rawDataHex,
  }: {
    scope: Network;
    type: string;
    rawDataHex: string;
  }): Promise<TransactionWithMetadata> {
    try {
      const tronWeb = this.#tronWebFactory.createClient(scope);
      const rawData = tronWeb.utils.deserializeTx.deserializeTransaction(
        type,
        rawDataHex,
      ) as Types.Transaction['raw_data'];
      const txID = bytesToHex(await sha256(hexToBytes(rawDataHex))).slice(2);
      const transaction = {
        txID,
        raw_data: rawData,
        raw_data_hex: rawDataHex,
      };
      const freshRawData = await this.#ensureFreshRawData(tronWeb, rawData);

      if (freshRawData === rawData) {
        return transaction;
      }

      return this.#rebuildTransactionWithRawData(
        tronWeb,
        transaction,
        freshRawData,
      );
    } catch {
      throw new Error(TRANSACTION_METADATA_REFRESH_ERROR);
    }
  }

  /**
   * Ensures TRON transaction TAPOS and expiration metadata is usable
   * immediately before signing and broadcasting.
   *
   * @param params - Refresh inputs.
   * @param params.scope - Network scope used to create a TronWeb client.
   * @param params.transaction - Unsigned transaction to validate and refresh.
   * @returns The transaction to sign.
   */
  async ensureFreshMetadata<TransactionType extends TransactionWithMetadata>({
    scope,
    transaction,
  }: {
    scope: Network;
    transaction: TransactionType;
  }): Promise<TransactionType> {
    try {
      const tronWeb = this.#tronWebFactory.createClient(scope);
      const freshRawData = await this.#ensureFreshRawData(
        tronWeb,
        transaction.raw_data,
      );

      if (freshRawData === transaction.raw_data) {
        return transaction;
      }

      return this.#rebuildTransactionWithRawData(
        tronWeb,
        transaction,
        freshRawData,
      );
    } catch {
      throw new Error(TRANSACTION_METADATA_REFRESH_ERROR);
    }
  }

  /**
   * Ensures TRON transaction raw data has fresh TAPOS and expiration metadata.
   *
   * @param params - Refresh inputs.
   * @param params.scope - Network scope used to create a TronWeb client.
   * @param params.rawData - Transaction raw data to validate and refresh.
   * @returns The raw data to scan or sign.
   */
  async ensureFreshRawData<RawDataType extends TransactionRawData>({
    scope,
    rawData,
  }: {
    scope: Network;
    rawData: RawDataType;
  }): Promise<RawDataType> {
    try {
      return await this.#ensureFreshRawData(
        this.#tronWebFactory.createClient(scope),
        rawData,
      );
    } catch {
      throw new Error(TRANSACTION_METADATA_REFRESH_ERROR);
    }
  }

  async #ensureFreshRawData<RawDataType extends TransactionRawData>(
    tronWeb: TronWeb,
    rawData: RawDataType,
  ): Promise<RawDataType> {
    try {
      const now = Date.now();
      const currentBlock = await tronWeb.trx.getCurrentBlock();
      const expirationMetadataParams = {
        currentBlock,
        now,
        rawData,
      };

      if (!hasFreshExpirationMetadata(expirationMetadataParams)) {
        return buildRefreshedRawData(rawData, currentBlock);
      }

      const referenceBlockNumber = getReferenceBlockNumber({
        currentBlockNumber: currentBlock.block_header.raw_data.number,
        refBlockBytes: expirationMetadataParams.rawData.ref_block_bytes,
      });

      if (
        !hasValidReferenceBlockNumber({
          currentBlock,
          referenceBlockNumber,
        })
      ) {
        return buildRefreshedRawData(rawData, currentBlock);
      }

      const referencedBlock = await this.#getReferenceBlock({
        tronWeb,
        currentBlock,
        referenceBlockNumber,
      });

      if (
        !referencedBlockMatchesRawData({
          rawData: expirationMetadataParams.rawData,
          referencedBlock,
        })
      ) {
        return buildRefreshedRawData(rawData, currentBlock);
      }

      return rawData;
    } catch {
      throw new Error(TRANSACTION_METADATA_REFRESH_ERROR);
    }
  }

  async #getReferenceBlock({
    tronWeb,
    currentBlock,
    referenceBlockNumber,
  }: {
    tronWeb: TronWeb;
    currentBlock: Block;
    referenceBlockNumber: number;
  }): Promise<Block | undefined> {
    const currentBlockNumber = currentBlock.block_header.raw_data.number;

    if (referenceBlockNumber === currentBlockNumber) {
      return currentBlock;
    }

    try {
      return await tronWeb.trx.getBlockByNumber(referenceBlockNumber);
    } catch {
      return undefined;
    }
  }

  #rebuildTransactionWithRawData<
    TransactionType extends TransactionWithMetadata,
  >(
    tronWeb: TronWeb,
    transaction: TransactionType,
    rawData: TransactionRawData,
  ): TransactionType {
    const refreshedTransaction = {
      ...transaction,
      raw_data: rawData,
    };
    const transactionPb =
      tronWeb.utils.transaction.txJsonToPb(refreshedTransaction);

    return {
      ...refreshedTransaction,
      raw_data_hex: tronWeb.utils.transaction.txPbToRawDataHex(transactionPb),
      txID: tronWeb.utils.transaction
        .txPbToTxID(transactionPb)
        .replace(/^0x/u, ''),
    };
  }
}

/**
 * Builds raw data with expiration and TAPOS metadata from the current block.
 *
 * @param rawData - Transaction raw data to refresh.
 * @param currentBlock - Current network block.
 * @returns Raw data with refreshed expiration metadata.
 */
function buildRefreshedRawData<RawDataType extends TransactionRawData>(
  rawData: RawDataType,
  currentBlock: Block,
): RawDataType {
  const { number: currentBlockNumber, timestamp: currentBlockTimestamp } =
    currentBlock.block_header.raw_data;

  return {
    ...rawData,
    ref_block_bytes: getRefBlockBytes(currentBlockNumber),
    ref_block_hash: getRefBlockHash(currentBlock),
    expiration: currentBlockTimestamp + DEFAULT_EXPIRATION_MS,
    timestamp: currentBlockTimestamp,
  };
}

/**
 * Checks whether raw data has expiration metadata that is safe to keep.
 *
 * @param params - Expiration freshness inputs.
 * @returns Whether the existing expiration metadata is fresh.
 */
function hasFreshExpirationMetadata(
  params: HasFreshExpirationMetadataParams,
): params is HasFreshExpirationMetadataResult {
  return (
    hasRequiredExpirationMetadata(params.rawData) &&
    hasFreshExpiration({
      currentBlock: params.currentBlock,
      now: params.now,
      rawData: params.rawData,
    }) &&
    hasAllowedExpirationWindow({
      currentBlock: params.currentBlock,
      rawData: params.rawData,
    })
  );
}

/**
 * Checks whether raw data has the metadata needed for freshness validation.
 *
 * @param rawData - Transaction raw data to inspect.
 * @returns Whether required expiration metadata is present.
 */
function hasRequiredExpirationMetadata(
  rawData: TransactionRawData,
): rawData is TransactionRawDataWithExpirationMetadata {
  return (
    typeof rawData.ref_block_bytes === 'string' &&
    typeof rawData.ref_block_hash === 'string' &&
    typeof rawData.expiration === 'number'
  );
}

/**
 * Checks whether expiration leaves enough time for signing and broadcasting.
 *
 * @param options0 - Freshness check inputs.
 * @param options0.currentBlock - Current network block.
 * @param options0.now - Current local timestamp in milliseconds.
 * @param options0.rawData - Transaction raw data with expiration metadata.
 * @returns Whether expiration is outside the refresh buffer.
 */
function hasFreshExpiration({
  currentBlock,
  now,
  rawData,
}: {
  currentBlock: Block;
  now: number;
  rawData: TransactionRawDataWithExpirationMetadata;
}): boolean {
  const currentBlockTimestamp = currentBlock.block_header.raw_data.timestamp;

  return (
    rawData.expiration >
    Math.max(now, currentBlockTimestamp) +
      TRANSACTION_METADATA_EXPIRATION_BUFFER_MS
  );
}

/**
 * Checks whether expiration is within TRON's maximum transaction window.
 *
 * @param options0 - Expiration window inputs.
 * @param options0.currentBlock - Current network block.
 * @param options0.rawData - Transaction raw data with expiration metadata.
 * @returns Whether expiration is within the maximum allowed window.
 */
function hasAllowedExpirationWindow({
  currentBlock,
  rawData,
}: {
  currentBlock: Block;
  rawData: TransactionRawDataWithExpirationMetadata;
}): boolean {
  const currentBlockTimestamp = currentBlock.block_header.raw_data.timestamp;

  return rawData.expiration < currentBlockTimestamp + MAX_EXPIRATION_MS;
}

/**
 * Reconstructs the referenced block number from TAPOS lower bytes.
 *
 * @param options0 - Reference block number inputs.
 * @param options0.currentBlockNumber - Current network block number.
 * @param options0.refBlockBytes - Lower bytes from transaction TAPOS metadata.
 * @returns Referenced block number candidate.
 */
function getReferenceBlockNumber({
  currentBlockNumber,
  refBlockBytes,
}: {
  currentBlockNumber: number;
  refBlockBytes: string;
}): number {
  const refBlockLowerBytes = Number.parseInt(refBlockBytes, 16);
  const currentWindowStart =
    Math.floor(currentBlockNumber / REFERENCE_BLOCK_WINDOW) *
    REFERENCE_BLOCK_WINDOW;
  const referenceBlockCandidate = currentWindowStart + refBlockLowerBytes;

  return referenceBlockCandidate > currentBlockNumber
    ? referenceBlockCandidate - REFERENCE_BLOCK_WINDOW
    : referenceBlockCandidate;
}

/**
 * Checks whether the referenced block number is inside the TAPOS window.
 *
 * @param options0 - Reference block validation inputs.
 * @param options0.currentBlock - Current network block.
 * @param options0.referenceBlockNumber - Referenced block number candidate.
 * @returns Whether the referenced block number can be used.
 */
function hasValidReferenceBlockNumber({
  currentBlock,
  referenceBlockNumber,
}: {
  currentBlock: Block;
  referenceBlockNumber: number;
}): boolean {
  const currentBlockNumber = currentBlock.block_header.raw_data.number;

  return (
    Number.isFinite(referenceBlockNumber) &&
    referenceBlockNumber >= 0 &&
    referenceBlockNumber <= currentBlockNumber &&
    currentBlockNumber - referenceBlockNumber < REFERENCE_BLOCK_WINDOW
  );
}

/**
 * Checks whether fetched block metadata matches the transaction TAPOS fields.
 *
 * @param options0 - Reference block matching inputs.
 * @param options0.rawData - Transaction raw data with TAPOS metadata.
 * @param options0.referencedBlock - Block fetched for the TAPOS reference.
 * @returns Whether the referenced block matches the raw data metadata.
 */
function referencedBlockMatchesRawData({
  rawData,
  referencedBlock,
}: {
  rawData: TransactionRawDataWithExpirationMetadata;
  referencedBlock: Block | undefined;
}): boolean {
  if (!referencedBlock) {
    return false;
  }

  return (
    getRefBlockBytes(referencedBlock.block_header.raw_data.number) ===
      rawData.ref_block_bytes.toLowerCase() &&
    getRefBlockHash(referencedBlock) === rawData.ref_block_hash.toLowerCase()
  );
}

/**
 * Gets TRON TAPOS lower block bytes for a block number.
 *
 * @param blockNumber - Block number to encode.
 * @returns TAPOS lower block bytes.
 */
function getRefBlockBytes(blockNumber: number): string {
  return blockNumber.toString(16).slice(-4).padStart(4, '0');
}

/**
 * Gets TRON TAPOS block hash segment from a block.
 *
 * @param block - Block to inspect.
 * @returns TAPOS block hash segment.
 */
function getRefBlockHash(block: Block): string {
  return block.blockID.slice(16, 32).toLowerCase();
}
