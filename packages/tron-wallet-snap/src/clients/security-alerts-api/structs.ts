import { SECURITY_ALERTS_SCAN_OPTIONS } from '@metamask/snap-networks-utils';
import type { Infer } from '@metamask/superstruct';
import {
  any,
  array,
  boolean,
  enums,
  literal,
  nonempty,
  nullable,
  number,
  optional,
  string,
  type,
  union,
} from '@metamask/superstruct';

/**
 * Scan parameters extracted from a Tron transaction, in the Security Alerts
 * API wire format. The sender is always required; the remaining fields are
 * nullable because not all transactions carry them.
 */
export const SecurityScanPayloadStruct = type({
  from: nonempty(string()),
  to: nullable(string()),
  data: nullable(string()),
  value: nullable(number()),
});

/**
 * JSON body sent to the Tron Security Alerts API scan endpoint.
 */
export const SecurityAlertRequestStruct = type({
  /** The scanned account's address in base58 format. */
  account_address: nonempty(string()),
  /**
   * The origin of the request: a domain for dApp origins, or a non-dApp
   * marker when the scan is initiated by the snap itself.
   */
  metadata: union([
    type({ domain: nonempty(string()) }),
    type({ non_dapp: literal(true) }),
  ]),
  /** The scan parameters extracted from the raw transaction data. */
  data: SecurityScanPayloadStruct,
  /** The requested scan options. */
  options: nonempty(array(enums(SECURITY_ALERTS_SCAN_OPTIONS))),
});

export type TronScanRequestBody = Infer<typeof SecurityAlertRequestStruct>;

export const FungibleAssetChangeStruct = type({
  usd_price: optional(string()),
  summary: optional(string()),
  value: optional(string()),
  raw_value: string(),
});

export const Erc721AssetChangeStruct = type({
  summary: optional(string()),
  token_id: string(),
  arbitrary_collection_token: boolean(),
  logo_url: optional(nullable(string())),
  usd_price: optional(string()),
});

export const Erc1155AssetChangeStruct = type({
  summary: optional(string()),
  token_id: string(),
  value: string(),
  arbitrary_collection_token: boolean(),
  logo_url: optional(nullable(string())),
  usd_price: optional(string()),
});

export const AssetChangeStruct = union([
  FungibleAssetChangeStruct,
  Erc721AssetChangeStruct,
  Erc1155AssetChangeStruct,
]);

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
