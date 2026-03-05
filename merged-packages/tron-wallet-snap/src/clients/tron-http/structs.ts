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

/**
 * Superstruct definitions for TronHttpClient response validation.
 * These structs ensure that API responses conform to expected schemas
 * and provide bounds validation to prevent malicious data injection.
 */

// --------------------------------------------------------------------------
// TRC10 Token Info Structs
// --------------------------------------------------------------------------

export const TRC10TokenInfoStruct = type({
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

export const AccountResourcesStruct = type({
  freeNetUsed: optional(min(number(), 0)),
  freeNetLimit: optional(min(number(), 0)),
  NetUsed: optional(min(number(), 0)),
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

/**
 * Account resources derived from the Superstruct schema.
 *
 * @see https://developers.tron.network/reference/getaccountresource
 */
export type AccountResources = Infer<typeof AccountResourcesStruct>;

// --------------------------------------------------------------------------
// FullNodeTransactionInfo Structs
// --------------------------------------------------------------------------

export const FullNodeTransactionReceiptStruct = type({
  energy_usage: optional(min(number(), 0)),
  energy_fee: optional(min(number(), 0)),
  origin_energy_usage: optional(min(number(), 0)),
  energy_usage_total: optional(min(number(), 0)),
  net_usage: optional(min(number(), 0)),
  net_fee: optional(min(number(), 0)),
  result: optional(string()),
  energy_penalty_total: optional(min(number(), 0)),
});

export const FullNodeTransactionLogStruct = type({
  address: string(),
  topics: array(string()),
  data: string(),
});

export const FullNodeInternalTransactionStruct = type({
  hash: optional(string()),
  caller_address: optional(string()),
  transferTo_address: optional(string()),
  callValueInfo: optional(
    array(
      type({
        callValue: optional(min(number(), 0)),
        tokenId: optional(string()),
      }),
    ),
  ),
  note: optional(string()),
  rejected: optional(boolean()),
});

export const FullNodeTransactionInfoStruct = type({
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

// --------------------------------------------------------------------------
// Next Maintenance Time Structs
// --------------------------------------------------------------------------

/**
 * Response from /wallet/getnextmaintenancetime endpoint.
 * The `num` field contains the Unix timestamp (in milliseconds) of the next maintenance period.
 *
 * @see https://developers.tron.network/reference/getnextmaintenancetime
 */
export const NextMaintenanceTimeStruct = type({
  // eslint-disable-next-line id-denylist
  num: min(number(), 0),
});

export type ValidatedNextMaintenanceTime = Infer<
  typeof NextMaintenanceTimeStruct
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
// Contract Info Structs (Energy Sharing Parameters)
// --------------------------------------------------------------------------

export const ContractInfoStruct = type({
  origin_address: optional(string()),
  consume_user_resource_percent: optional(min(number(), 0)),
  origin_energy_limit: optional(min(number(), 0)),
});

export type ValidatedContractInfo = Infer<typeof ContractInfoStruct>;

// --------------------------------------------------------------------------
// Staking Rewards Structs
// --------------------------------------------------------------------------

/**
 * Response from /wallet/getReward endpoint.
 * Returns the unclaimed staking rewards for an address.
 *
 * @see https://developers.tron.network/reference/getreward
 */
export const GetRewardResponseStruct = type({
  reward: optional(min(number(), 0)),
});

export type GetRewardResponse = Infer<typeof GetRewardResponseStruct>;
