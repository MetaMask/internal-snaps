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
