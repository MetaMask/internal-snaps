import { SECURITY_ALERTS_SCAN_OPTIONS } from '@metamask/snap-networks-utils';
import type { Infer } from '@metamask/superstruct';
import {
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
 * Metadata identifying the initiator of a scan request, in the wire format
 * of the Solana Security Alerts API scan endpoint. The API requires the
 * `url` key to be present (its value may be null for non-dApp scans).
 */
export const SecurityAlertMetadataStruct = type({
  /** The dApp URL that initiated the transaction, or null for non-dApp scans. */
  url: nullable(string()),
  /** Whether the transaction was not initiated by a dapp. */
  non_dapp: optional(boolean()),
});

export type SecurityAlertsMetadata = Infer<typeof SecurityAlertMetadataStruct>;

/**
 * JSON body sent to the Solana Security Alerts API scan endpoint.
 */
export const SecurityAlertRequestStruct = type({
  /** The signing method that produced the transaction. */
  method: nonempty(string()),
  /** The wire encoding of the transaction payload. */
  encoding: literal('base64'),
  /** The scanned account's address, base64-encoded. */
  account_address: nonempty(string()),
  /** The origin of the request: a dApp URL, or null with a non-dApp marker. */
  metadata: SecurityAlertMetadataStruct,
  /** The Security Alerts API chain identifier. */
  chain: enums(['mainnet', 'devnet', 'testnet', 'localnet']),
  /** The transactions to scan, in the wire encoding. */
  transactions: nonempty(array(nonempty(string()))),
  /** The requested scan options. */
  options: nonempty(array(enums(SECURITY_ALERTS_SCAN_OPTIONS))),
});

export type SolanaScanRequestBody = Infer<typeof SecurityAlertRequestStruct>;

/**
 * Error details for a scan that failed at the API level.
 */
export const ApiErrorDetailsStruct = type({
  type: string(),
  message: string(),
});

/**
 * Error details for a scan that failed on a transaction error.
 */
export const TransactionErrorDetailsStruct = type({
  type: string(),
  message: string(),
  number: optional(nullable(number())),
  code: optional(nullable(string())),
  transaction_index: number(),
});

/**
 * Error details for a scan that failed on an instruction error.
 */
export const InstructionErrorDetailsStruct = type({
  type: string(),
  message: string(),
  transaction_index: number(),
  instruction_index: number(),
  program_account: nullable(string()),
});

export const ErrorDetailsStruct = union([
  ApiErrorDetailsStruct,
  TransactionErrorDetailsStruct,
  InstructionErrorDetailsStruct,
]);

/**
 * A single asset change (either the `in` or `out` side of a diff).
 */
export const AssetChangeStruct = type({
  usd_price: optional(nullable(number())),
  summary: optional(nullable(string())),
  value: optional(nullable(number())),
  raw_value: optional(nullable(number())),
});

export const AssetStruct = type({
  type: string(),
  address: optional(string()),
  symbol: optional(string()),
  name: optional(string()),
  logo: optional(nullable(string())),
  decimals: optional(number()),
});

export const AssetDiffStruct = type({
  asset_type: string(),
  asset: AssetStruct,
  in: optional(nullable(AssetChangeStruct)),
  out: optional(nullable(AssetChangeStruct)),
});

export const AccountSummaryStruct = type({
  account_assets_diff: optional(array(AssetDiffStruct)),
});

export const SimulationStruct = type({
  account_summary: optional(AccountSummaryStruct),
});

export const ValidationStruct = type({
  result_type: optional(string()),
  reason: optional(nullable(string())),
});

const ResultStruct = type({
  /**
   * Omitted sections are reported as explicit `null` by the API (e.g. when
   * only one of `simulation` / `validation` is requested), not as missing
   * keys.
   */
  simulation: optional(nullable(SimulationStruct)),
  validation: optional(nullable(ValidationStruct)),
});

/**
 * Response returned by the Solana scan endpoint.
 *
 * Only the fields this snap consumes are described; the API may return
 * additional fields, which are ignored.
 */
export const SecurityAlertResponseStruct = type({
  status: enums(['SUCCESS', 'ERROR']),
  result: optional(ResultStruct),
  error: optional(nullable(string())),
  error_details: optional(nullable(ErrorDetailsStruct)),
});

export type SecurityAlertSimulationValidationResponse = Infer<
  typeof SecurityAlertResponseStruct
>;
