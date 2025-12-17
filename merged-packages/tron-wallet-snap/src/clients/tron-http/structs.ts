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

/**
 * Superstruct definitions for TronHttpClient response validation.
 * These structs ensure that API responses conform to expected schemas
 * and provide bounds validation to prevent malicious data injection.
 */

// --------------------------------------------------------------------------
// TronContract Structs
// --------------------------------------------------------------------------

export const TronContractAbiEntryStruct = object({
  type: string(),
  name: string(),
  inputs: optional(
    array(
      object({
        name: string(),
        type: string(),
      }),
    ),
  ),
  outputs: optional(
    array(
      object({
        name: string(),
        type: string(),
      }),
    ),
  ),
});

export const TronContractAbiStruct = object({
  entrys: array(TronContractAbiEntryStruct),
});

export const TronContractStruct = object({
  origin_address: string(),
  contract_address: string(),
  abi: TronContractAbiStruct,
  bytecode: string(),
  consume_user_resource_percent: min(number(), 0),
  name: string(),
  origin_energy_limit: min(number(), 0),
  code_hash: string(),
});

export type ValidatedTronContract = Infer<typeof TronContractStruct>;

// --------------------------------------------------------------------------
// TriggerConstantContract Structs (for TronHttpClient)
// --------------------------------------------------------------------------

export const TronHttpTriggerConstantContractResultStruct = object({
  result: boolean(),
});

export const TronHttpTriggerConstantContractTransactionRetStruct = object({
  contractRet: string(),
});

export const TronHttpTriggerConstantContractRawDataStruct = object({
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

export const TronHttpTriggerConstantContractTransactionStruct = object({
  ret: array(TronHttpTriggerConstantContractTransactionRetStruct),
  visible: boolean(),
  txID: string(),
  raw_data: TronHttpTriggerConstantContractRawDataStruct,
  raw_data_hex: string(),
});

export const TronHttpTriggerConstantContractResponseStruct = object({
  result: TronHttpTriggerConstantContractResultStruct,
  energy_used: min(number(), 0),
  constant_result: array(string()),
  transaction: TronHttpTriggerConstantContractTransactionStruct,
});

export type ValidatedTronHttpTriggerConstantContractResponse = Infer<
  typeof TronHttpTriggerConstantContractResponseStruct
>;

// --------------------------------------------------------------------------
// TRC10 Token Info Structs
// --------------------------------------------------------------------------

export const TRC10TokenInfoStruct = object({
  id: string(),
  owner_address: string(),
  name: string(),
  abbr: string(),
  total_supply: min(number(), 0),
  trx_num: min(number(), 0),
  // eslint-disable-next-line id-denylist
  num: min(number(), 0),
  precision: min(number(), 0),
  start_time: min(number(), 0),
  end_time: min(number(), 0),
  description: string(),
  url: string(),
});

export type ValidatedTRC10TokenInfo = Infer<typeof TRC10TokenInfoStruct>;

// --------------------------------------------------------------------------
// Account Resources Structs
// --------------------------------------------------------------------------

export const AccountResourcesStruct = object({
  freeNetUsed: optional(min(number(), 0)),
  freeNetLimit: optional(min(number(), 0)),
  NetLimit: optional(min(number(), 0)),
  TotalNetLimit: optional(min(number(), 0)),
  TotalNetWeight: optional(min(number(), 0)),
  tronPowerUsed: optional(min(number(), 0)),
  tronPowerLimit: optional(min(number(), 0)),
  EnergyUsed: optional(min(number(), 0)),
  EnergyLimit: optional(min(number(), 0)),
  TotalEnergyLimit: optional(min(number(), 0)),
  TotalEnergyWeight: optional(min(number(), 0)),
});

export type ValidatedAccountResources = Infer<typeof AccountResourcesStruct>;

// --------------------------------------------------------------------------
// FullNodeTransactionInfo Structs
// --------------------------------------------------------------------------

export const FullNodeTransactionReceiptStruct = object({
  energy_usage: optional(min(number(), 0)),
  energy_fee: optional(min(number(), 0)),
  origin_energy_usage: optional(min(number(), 0)),
  energy_usage_total: optional(min(number(), 0)),
  net_usage: optional(min(number(), 0)),
  net_fee: optional(min(number(), 0)),
  result: optional(string()),
  energy_penalty_total: optional(min(number(), 0)),
});

export const FullNodeTransactionLogStruct = object({
  address: string(),
  topics: array(string()),
  data: string(),
});

export const FullNodeInternalTransactionStruct = object({
  hash: string(),
  caller_address: string(),
  transferTo_address: string(),
  callValueInfo: array(
    object({
      callValue: optional(min(number(), 0)),
      tokenId: optional(string()),
    }),
  ),
  note: string(),
  rejected: boolean(),
});

export const FullNodeTransactionInfoStruct = object({
  id: optional(string()),
  fee: optional(min(number(), 0)),
  blockNumber: optional(min(number(), 0)),
  blockTimeStamp: optional(min(number(), 0)),
  contractResult: optional(array(string())),
  contract_address: optional(string()),
  receipt: optional(FullNodeTransactionReceiptStruct),
  log: optional(array(FullNodeTransactionLogStruct)),
  result: optional(string()),
  resMessage: optional(string()),
  withdraw_amount: optional(min(number(), 0)),
  unfreeze_amount: optional(min(number(), 0)),
  internal_transactions: optional(array(FullNodeInternalTransactionStruct)),
  withdraw_expire_amount: optional(min(number(), 0)),
  cancel_unfreezeV2_amount: optional(record(string(), number())),
});

export type ValidatedFullNodeTransactionInfo = Infer<
  typeof FullNodeTransactionInfoStruct
>;
