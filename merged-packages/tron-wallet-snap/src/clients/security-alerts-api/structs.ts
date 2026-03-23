/* eslint-disable @typescript-eslint/naming-convention */
import type { Infer } from '@metamask/superstruct';
import {
  any,
  array,
  enums,
  nullable,
  number,
  optional,
  string,
  type,
  union,
} from '@metamask/superstruct';

export const AssetChangeStruct = type({
  usd_price: string(),
  summary: string(),
  value: string(),
  raw_value: string(),
});

export const AssetStruct = type({
  type: string(),
  symbol: optional(string()),
  name: optional(string()),
  logo_url: optional(nullable(string())),
  address: optional(string()),
  decimals: optional(number()),
});

export const AssetDiffStruct = type({
  asset_type: string(),
  asset: AssetStruct,
  in: array(AssetChangeStruct),
  out: array(AssetChangeStruct),
});

export const AccountSummaryStruct = type({
  assets_diffs: array(AssetDiffStruct),
});

export const SimulationErrorDetailsStruct = type({
  code: string(),
  category: string(),
});

export const TransactionErrorDetailsStruct = type({
  type: string(),
  message: string(),
  transaction_index: number(),
});

export const SimulationStruct = type({
  status: enums(['Success', 'Error']),
  error: optional(string()),
  error_details: optional(
    union([SimulationErrorDetailsStruct, TransactionErrorDetailsStruct]),
  ),
  account_summary: optional(AccountSummaryStruct),
});

export const ValidationStruct = type({
  status: enums(['Success', 'Error']),
  result_type: enums(['Benign', 'Warning', 'Malicious', 'Error']),
  error: optional(string()),
  description: optional(string()),
  reason: optional(string()),
  classification: optional(string()),

  features: optional(array(any())),
});

export const SecurityAlertResponseStruct = type({
  validation: ValidationStruct,
  simulation: SimulationStruct,
});

export type AssetChange = Infer<typeof AssetChangeStruct>;
export type Asset = Infer<typeof AssetStruct>;
export type AssetDiff = Infer<typeof AssetDiffStruct>;
export type AccountSummary = Infer<typeof AccountSummaryStruct>;
export type SimulationErrorDetails = Infer<typeof SimulationErrorDetailsStruct>;
export type TransactionErrorDetails = Infer<
  typeof TransactionErrorDetailsStruct
>;
export type Simulation = Infer<typeof SimulationStruct>;
export type Validation = Infer<typeof ValidationStruct>;
export type SecurityAlertSimulationValidationResponse = Infer<
  typeof SecurityAlertResponseStruct
>;
