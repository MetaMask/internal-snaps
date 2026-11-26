import type { Infer, Struct } from '@metamask/superstruct';
import {
  array,
  assign,
  boolean,
  literal,
  min,
  number,
  optional,
  record,
  string,
  type,
} from '@metamask/superstruct';

import { TronAddressStruct } from '../../validation/structs';
import { FullNodeInternalTransactionStruct } from '../tron-http/structs';

/**
 * Superstruct definitions for TrongridApiClient response validation.
 * These structs ensure that API responses conform to expected schemas
 * and provide bounds validation to prevent malicious data injection.
 */

// --------------------------------------------------------------------------
// TronAccount Response Structs
// --------------------------------------------------------------------------

export const RawTronKeyStruct = type({
  address: string(),
  weight: number(),
});

export const RawTronPermissionStruct = type({
  keys: array(RawTronKeyStruct),
  threshold: number(),
  permission_name: string(),
  operations: optional(string()),
  id: optional(number()),
  type: optional(string()),
});

export const RawTronAccountResourceStruct = type({
  energy_window_optimized: optional(boolean()),
  energy_window_size: optional(number()),
  delegated_frozenV2_balance_for_energy: optional(min(number(), 0)),
  delegated_frozenV2_balance_for_bandwidth: optional(min(number(), 0)),
});

export const RawTronFrozenV2Struct = type({
  amount: optional(min(number(), 0)),
  type: optional(string()),
});

export const RawTronUnfrozenV2Struct = type({
  unfreeze_amount: min(number(), 0),
  unfreeze_expire_time: min(number(), 0),
  type: optional(string()),
});

export const RawTronVoteStruct = type({
  vote_address: string(),
  vote_count: min(number(), 0),
});

// AssetV2 entry with key-value structure
export const RawTronAssetV2Struct = type({
  key: string(),
  value: number(),
});

export const TronAccountStruct = type({
  owner_permission: optional(RawTronPermissionStruct),
  account_resource: optional(RawTronAccountResourceStruct),
  active_permission: optional(array(RawTronPermissionStruct)),
  address: TronAddressStruct,
  create_time: optional(min(number(), 0)),
  latest_opration_time: optional(min(number(), 0)),
  frozenV2: optional(array(RawTronFrozenV2Struct)),
  unfrozenV2: optional(array(RawTronUnfrozenV2Struct)),
  balance: optional(min(number(), 0)),
  assetV2: optional(array(RawTronAssetV2Struct)),
  trc20: optional(array(record(string(), string()))),
  latest_consume_free_time: optional(min(number(), 0)),
  votes: optional(array(RawTronVoteStruct)),
  latest_withdraw_time: optional(min(number(), 0)),
  net_window_size: optional(min(number(), 0)),
  net_window_optimized: optional(boolean()),
});

export type ValidatedTronAccount = Infer<typeof TronAccountStruct>;

// --------------------------------------------------------------------------
// Transaction Info Structs
// --------------------------------------------------------------------------

export const TransactionResultStruct = type({
  contractRet: optional(string()),
  fee: optional(min(number(), 0)),
});

export const ContractVoteStruct = type({
  vote_address: string(),
  vote_count: min(number(), 0),
});

export const ContractValueStruct = type({
  owner_address: optional(string()),
  to_address: optional(string()),
  unfreeze_balance: optional(min(number(), 0)),
  votes: optional(array(ContractVoteStruct)),
  frozen_balance: optional(min(number(), 0)),
  data: optional(string()),
  contract_address: optional(string()),
  call_value: optional(min(number(), 0)),
  amount: optional(min(number(), 0)),
  asset_name: optional(string()),
  frozen_balance_v2: optional(min(number(), 0)),
  resource: optional(string()),
});

export const ContractParameterStruct = type({
  value: ContractValueStruct,
  type_url: string(),
});

export const ContractInfoStruct = type({
  parameter: ContractParameterStruct,
  type: string(),
});

export const InternalTransactionCallValueStruct = type({
  _: optional(number()),
  callValue: optional(min(number(), 0)),
  tokenId: optional(string()),
});

export const InternalTransactionDataStruct = type({
  note: optional(string()),
  rejected: optional(boolean()),
  call_value: optional(InternalTransactionCallValueStruct),
});

/**
 * Trongrid returns internal transactions in its own shape, but
 * `TransactionsService` replaces them with the Full Node shape when it
 * enriches potential swaps, so an entry may carry the fields of either.
 */
export const InternalTransactionStruct = assign(
  type({
    internal_tx_id: optional(string()),
    data: optional(InternalTransactionDataStruct),
    to_address: optional(string()),
    from_address: optional(string()),
  }),
  FullNodeInternalTransactionStruct,
);

export const RawTransactionDataStruct = type({
  contract: array(ContractInfoStruct),
  ref_block_bytes: string(),
  ref_block_hash: string(),
  expiration: min(number(), 0),
  timestamp: optional(min(number(), 0)),
  fee_limit: optional(min(number(), 0)),
});

export const TransactionInfoStruct = type({
  ret: optional(array(TransactionResultStruct)),
  signature: optional(array(string())),
  txID: string(),
  net_usage: optional(min(number(), 0)),
  raw_data_hex: optional(string()),
  net_fee: optional(min(number(), 0)),
  energy_usage: optional(min(number(), 0)),
  blockNumber: optional(min(number(), 0)),
  block_timestamp: optional(min(number(), 0)),
  energy_fee: optional(min(number(), 0)),
  energy_usage_total: optional(min(number(), 0)),
  raw_data: RawTransactionDataStruct,
  internal_transactions: optional(array(InternalTransactionStruct)),
});

export type ValidatedTransactionInfo = Infer<typeof TransactionInfoStruct>;

// --------------------------------------------------------------------------
// Contract Transaction Info Structs (TRC20)
// --------------------------------------------------------------------------

export const TokenInfoStruct = type({
  symbol: string(),
  address: string(),
  decimals: min(number(), 0),
  name: string(),
});

export const ContractTransactionInfoStruct = type({
  transaction_id: string(),
  token_info: TokenInfoStruct,
  block_timestamp: min(number(), 0),
  from: string(),
  to: string(),
  type: string(),
  value: string(),
});

export type ValidatedContractTransactionInfo = Infer<
  typeof ContractTransactionInfoStruct
>;

// --------------------------------------------------------------------------
// Generic API Response Wrapper Struct
// --------------------------------------------------------------------------

export const TrongridApiMetaStruct = type({
  at: min(number(), 0),
  page_size: min(number(), 0),
});

export type TrongridApiMeta = Infer<typeof TrongridApiMetaStruct>;

/**
 * Trongrid reports failures in-band with `success: false`.
 */
export const TrongridApiSuccessStruct = type({
  success: literal(true),
});

/**
 * Build the struct of a successful Trongrid `/v1` response envelope.
 *
 * @param itemStruct - The struct each entry of `data` must match.
 * @returns The envelope struct. `data` is optional because Trongrid omits it for empty results.
 */
export const trongridApiResponseStruct = <Item>(
  itemStruct: Struct<Item>,
): Struct<{ success: true; meta: TrongridApiMeta; data?: Item[] }> =>
  type({
    success: literal(true),
    meta: TrongridApiMetaStruct,
    data: optional(array(itemStruct)),
  });

// --------------------------------------------------------------------------
// TRC20 Balance Response Structs (for inactive account fallback)
// --------------------------------------------------------------------------

/**
 * Struct for validating individual TRC20 balance entries.
 * Each entry is a record mapping contract address to balance string.
 */
export const Trc20BalanceStruct = record(string(), string());
