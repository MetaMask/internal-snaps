/* eslint-disable @typescript-eslint/naming-convention */
import type { Infer } from '@metamask/superstruct';
import {
  array,
  boolean,
  min,
  number,
  optional,
  record,
  string,
  type,
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
  // eslint-disable-next-line id-length
  _: number(),
});

export const InternalTransactionDataStruct = type({
  note: string(),
  rejected: boolean(),
  call_value: optional(InternalTransactionCallValueStruct),
});

export const InternalTransactionStruct = type({
  internal_tx_id: string(),
  data: InternalTransactionDataStruct,
  to_address: string(),
  from_address: string(),
});

export const RawTransactionDataStruct = type({
  contract: array(ContractInfoStruct),
  ref_block_bytes: string(),
  ref_block_hash: string(),
  expiration: min(number(), 0),
  timestamp: min(number(), 0),
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
// Chain Parameter Structs
// --------------------------------------------------------------------------

export const ChainParameterStruct = type({
  key: string(),
  value: optional(number()),
});

export type ValidatedChainParameter = Infer<typeof ChainParameterStruct>;

export const ChainParametersResponseStruct = type({
  chainParameter: array(ChainParameterStruct),
});

// --------------------------------------------------------------------------
// TriggerConstantContract Structs
// --------------------------------------------------------------------------

export const TriggerConstantContractResultStruct = type({
  result: boolean(),
  message: optional(string()),
});

export const TriggerConstantContractTransactionRawDataStruct = type({
  contract: array(
    type({
      parameter: type({
        value: type({
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

export const TriggerConstantContractTransactionStruct = type({
  ret: array(
    type({
      ret: optional(string()),
    }),
  ),
  visible: boolean(),
  txID: string(),
  raw_data: TriggerConstantContractTransactionRawDataStruct,
  raw_data_hex: string(),
});

export const TriggerConstantContractResponseStruct = type({
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

export const TrongridApiMetaStruct = type({
  at: min(number(), 0),
  page_size: min(number(), 0),
});

// Pre-built response structs for common use cases
export const TrongridAccountResponseStruct = type({
  data: array(TronAccountStruct),
  success: boolean(),
  meta: TrongridApiMetaStruct,
});

export const TrongridTransactionInfoResponseStruct = type({
  data: array(TransactionInfoStruct),
  success: boolean(),
  meta: TrongridApiMetaStruct,
});

export const TrongridContractTransactionInfoResponseStruct = type({
  data: array(ContractTransactionInfoStruct),
  success: boolean(),
  meta: TrongridApiMetaStruct,
});
