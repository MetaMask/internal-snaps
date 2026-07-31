/* eslint-disable @typescript-eslint/naming-convention */
import type { Json } from '@metamask/snaps-sdk';
import type { Types } from 'tronweb';
import type { Block } from 'tronweb/lib/esm/types/APIResponse';

export type TransactionRawData = Types.Transaction['raw_data'];

export type JsonTransactionRawData = TransactionRawData & {
  [prop: string]: Json;
};

export type TransactionRawDataWithExpirationMetadata = TransactionRawData & {
  expiration: number;
  ref_block_bytes: string;
  ref_block_hash: string;
};

export type TransactionWithMetadata<
  RawDataType extends TransactionRawData = TransactionRawData,
> = {
  raw_data: RawDataType;
  raw_data_hex: string;
  txID: string;
};

export type HasFreshExpirationMetadataParams = {
  currentBlock: Block;
  now: number;
  rawData: TransactionRawData;
};

export type HasFreshExpirationMetadataResult =
  HasFreshExpirationMetadataParams & {
    rawData: TransactionRawDataWithExpirationMetadata;
  };
