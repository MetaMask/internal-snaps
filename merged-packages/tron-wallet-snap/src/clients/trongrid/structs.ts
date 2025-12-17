/* eslint-disable @typescript-eslint/naming-convention */
import type { Infer } from '@metamask/superstruct';
import {
  array,
  boolean,
  min,
  number,
  object,
  optional,
  record,
  string,
} from '@metamask/superstruct';

import { TronAddressStruct } from '../../validation/structs';

/**
 * Superstruct definitions for TrongridApiClient response validation.
 * These structs ensure that API responses conform to expected schemas
 * and provide bounds validation to prevent malicious data injection.
 */

// --------------------------------------------------------------------------
// TronAccount Response Structs
// --------------------------------------------------------------------------

export const RawTronKeyStruct = object({
  address: string(),
  weight: number(),
});

export const RawTronPermissionStruct = object({
  keys: array(RawTronKeyStruct),
  threshold: number(),
  permission_name: string(),
  operations: optional(string()),
  id: optional(number()),
  type: optional(string()),
});

export const RawTronAccountResourceStruct = object({
  energy_window_optimized: boolean(),
  energy_window_size: number(),
  delegated_frozenV2_balance_for_energy: optional(min(number(), 0)),
  delegated_frozenV2_balance_for_bandwidth: optional(min(number(), 0)),
});

export const RawTronFrozenV2Struct = object({
  amount: optional(min(number(), 0)),
  type: optional(string()),
});

export const RawTronUnfrozenV2Struct = object({
  unfreeze_amount: min(number(), 0),
  unfreeze_expire_time: min(number(), 0),
});

export const RawTronVoteStruct = object({
  vote_address: string(),
  vote_count: min(number(), 0),
});

export const TronAccountStruct = object({
  owner_permission: RawTronPermissionStruct,
  account_resource: RawTronAccountResourceStruct,
  active_permission: array(RawTronPermissionStruct),
  address: TronAddressStruct,
  create_time: min(number(), 0),
  latest_opration_time: min(number(), 0),
  frozenV2: array(RawTronFrozenV2Struct),
  unfrozenV2: array(RawTronUnfrozenV2Struct),
  balance: min(number(), 0),
  assetV2: optional(array(record(string(), string()))),
  trc20: optional(array(record(string(), string()))),
  latest_consume_free_time: min(number(), 0),
  votes: array(RawTronVoteStruct),
  latest_withdraw_time: min(number(), 0),
  net_window_size: min(number(), 0),
  net_window_optimized: boolean(),
});

export type ValidatedTronAccount = Infer<typeof TronAccountStruct>;

// --------------------------------------------------------------------------
// Transaction Info Structs
// --------------------------------------------------------------------------

export const TransactionResultStruct = object({
  contractRet: string(),
  fee: min(number(), 0),
});

export const ContractVoteStruct = object({
  vote_address: string(),
  vote_count: min(number(), 0),
});

export const ContractValueStruct = object({
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
});

export const ContractParameterStruct = object({
  value: ContractValueStruct,
  type_url: string(),
});

export const ContractInfoStruct = object({
  parameter: ContractParameterStruct,
  type: string(),
});

export const InternalTransactionCallValueStruct = object({
  // eslint-disable-next-line id-length
  _: number(),
});

export const InternalTransactionDataStruct = object({
  note: string(),
  rejected: boolean(),
  call_value: optional(InternalTransactionCallValueStruct),
});

export const InternalTransactionStruct = object({
  internal_tx_id: string(),
  data: InternalTransactionDataStruct,
  to_address: string(),
  from_address: string(),
});

export const RawTransactionDataStruct = object({
  contract: array(ContractInfoStruct),
  ref_block_bytes: string(),
  ref_block_hash: string(),
  expiration: min(number(), 0),
  timestamp: min(number(), 0),
  fee_limit: optional(min(number(), 0)),
});

export const TransactionInfoStruct = object({
  ret: array(TransactionResultStruct),
  signature: array(string()),
  txID: string(),
  net_usage: min(number(), 0),
  raw_data_hex: string(),
  net_fee: min(number(), 0),
  energy_usage: min(number(), 0),
  blockNumber: min(number(), 0),
  block_timestamp: min(number(), 0),
  energy_fee: min(number(), 0),
  energy_usage_total: min(number(), 0),
  raw_data: RawTransactionDataStruct,
  internal_transactions: array(InternalTransactionStruct),
});

export type ValidatedTransactionInfo = Infer<typeof TransactionInfoStruct>;

// --------------------------------------------------------------------------
// Contract Transaction Info Structs (TRC20)
// --------------------------------------------------------------------------

export const TokenInfoStruct = object({
  symbol: string(),
  address: string(),
  decimals: min(number(), 0),
  name: string(),
});

export const ContractTransactionInfoStruct = object({
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
// Chain Parameter Structs
// --------------------------------------------------------------------------

export const ChainParameterStruct = object({
  key: string(),
  value: optional(number()),
});

export type ValidatedChainParameter = Infer<typeof ChainParameterStruct>;

export const ChainParametersResponseStruct = object({
  chainParameter: array(ChainParameterStruct),
});

// --------------------------------------------------------------------------
// TriggerConstantContract Structs
// --------------------------------------------------------------------------

export const TriggerConstantContractResultStruct = object({
  result: boolean(),
  message: optional(string()),
});

export const TriggerConstantContractTransactionRawDataStruct = object({
  contract: array(
    object({
      parameter: object({
        value: object({
          data: string(),
          owner_address: string(),
          contract_address: string(),
        }),
        type_url: string(),
      }),
      type: string(),
    }),
  ),
  ref_block_bytes: string(),
  ref_block_hash: string(),
  expiration: min(number(), 0),
  timestamp: min(number(), 0),
});

export const TriggerConstantContractTransactionStruct = object({
  ret: array(
    object({
      ret: string(),
    }),
  ),
  visible: boolean(),
  txID: string(),
  raw_data: TriggerConstantContractTransactionRawDataStruct,
  raw_data_hex: string(),
});

export const TriggerConstantContractResponseStruct = object({
  result: TriggerConstantContractResultStruct,
  energy_used: min(number(), 0),
  constant_result: array(string()),
  energy_penalty: optional(min(number(), 0)),
  transaction: TriggerConstantContractTransactionStruct,
});

export type ValidatedTriggerConstantContractResponse = Infer<
  typeof TriggerConstantContractResponseStruct
>;

// --------------------------------------------------------------------------
// Generic API Response Wrapper Struct
// --------------------------------------------------------------------------

export const TrongridApiMetaStruct = object({
  at: min(number(), 0),
  page_size: min(number(), 0),
});

// Pre-built response structs for common use cases
export const TrongridAccountResponseStruct = object({
  data: array(TronAccountStruct),
  success: boolean(),
  meta: TrongridApiMetaStruct,
});

export const TrongridTransactionInfoResponseStruct = object({
  data: array(TransactionInfoStruct),
  success: boolean(),
  meta: TrongridApiMetaStruct,
});

export const TrongridContractTransactionInfoResponseStruct = object({
  data: array(ContractTransactionInfoStruct),
  success: boolean(),
  meta: TrongridApiMetaStruct,
});
