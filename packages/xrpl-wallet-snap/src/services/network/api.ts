import {
  defaulted,
  Infer,
  record,
  Struct,
  unknown,
} from '@metamask/superstruct';
import {
  array,
  assign,
  boolean,
  integer,
  literal,
  min,
  nonempty,
  number,
  object,
  optional,
  size,
  string,
  type,
  union,
  enums,
} from '@metamask/superstruct';
import { HexStruct } from '@metamask/utils';

import {
  CurrencyCodeStruct,
  UnSignedIntegerStringStruct,
  UnSignedIntegerStruct,
  SignedNumberStringStruct,
  UnSignedNumberStringStruct,
  ValidDestinationTagStruct,
  XrplTransactionStringStruct,
  ValidXrplDropsStruct,
  XrplAddressStruct,
  XrplTransactionHashStruct,
} from '../../api';
import { MptIssuanceIdStruct } from '../../api/asset';
import { Hash256Struct } from '../../api/string';

/**
 * Known Xrpld JSON-RPC error codes returned by `submit` and shared universal
 * method failures.
 *
 * @see https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/submit
 * @see https://xrpl.org/docs/references/http-websocket-apis/api-conventions/error-formatting
 */
export const KnownRpcError = {
  /** The server is amendment blocked and needs an update. */
  AmendmentBlocked: 'amendmentBlocked',
  /** The account was not found. */
  AccountNotFound: 'actNotFound',
  /** The destination account was not found. */
  DestinationAccountNotFound: 'dstActNotFound',
  /** The transaction was not found. */
  TransactionNotFound: 'txnNotFound',
  /** The Ledger Entry was not found. */
  entryNotFound: 'entryNotFound',

  /**
   * The server's fee multiplier exceeds the specified `fee_mult_max`
   * (Sign-and-Submit mode only).
   */
  HighFee: 'highFee',
  /** Internal error during JSON serialization of the transaction. */
  InternalJson: 'internalJson',
  /** Internal error during transaction submission. */
  InternalSubmit: 'internalSubmit',
  /** Internal error during transaction processing. */
  InternalTransaction: 'internalTransaction',
  /** Required fields are missing or fields are specified incorrectly. */
  InvalidParams: 'invalidParams',
  /** The transaction is malformed or invalid. */
  InvalidTransaction: 'invalidTransaction',
  /** No path found for the payment (Sign-and-Submit mode only). */
  NoPath: 'noPath',
  /** The server is too busy for pathfinding (Sign-and-Submit mode only). */
  TooBusy: 'tooBusy',
  /** Signing is not supported/enabled on this server. */
  NotSupported: 'notSupported',
  /** The server could not forward the request to a suitable peer. */
  FailedToForward: 'failedToForward',
  /** The request used an unsupported or invalid `api_version`. */
  InvalidApiVersion: 'invalid_API_version',
  /** The server has no closed ledger available. */
  NoClosed: 'noClosed',
  /** The server has no current (open) ledger available. */
  NoCurrent: 'noCurrent',
  /** The server is not synced to the network. */
  NoNetwork: 'noNetwork',
  /** The requested JSON-RPC method is unknown. */
  UnknownCmd: 'unknownCmd',
} as const;

export type KnownRpcError = (typeof KnownRpcError)[keyof typeof KnownRpcError];

/**
 * The type of XRPL transaction.
 */
export const XrplTransactionType = {
  Batch: 'Batch',
  AccountSet: 'AccountSet',
  AccountDelete: 'AccountDelete',
  AMMBid: 'AMMBid',
  AMMCreate: 'AMMCreate',
  AMMDelete: 'AMMDelete',
  AMMDeposit: 'AMMDeposit',
  AMMVote: 'AMMVote',
  AMMWithdraw: 'AMMWithdraw',
  CheckCancel: 'CheckCancel',
  CheckCash: 'CheckCash',
  CheckCreate: 'CheckCreate',
  Clawback: 'Clawback',
  DIDDelete: 'DIDDelete',
  DIDSet: 'DIDSet',
  DepositPreauth: 'DepositPreauth',
  EscrowCancel: 'EscrowCancel',
  EscrowFinish: 'EscrowFinish',
  EscrowCreate: 'EscrowCreate',
  NFTokenAcceptOffer: 'NFTokenAcceptOffer',
  NFTokenBurn: 'NFTokenBurn',
  NFTokenCancelOffer: 'NFTokenCancelOffer',
  NFTokenCreateOffer: 'NFTokenCreateOffer',
  NFTokenMint: 'NFTokenMint',
  OfferCancel: 'OfferCancel',
  OfferCreate: 'OfferCreate',
  MPTokenAuthorize: 'MPTokenAuthorize',
  MPTokenIssuanceCreate: 'MPTokenIssuanceCreate',
  MPTokenIssuanceDestroy: 'MPTokenIssuanceDestroy',
  MPTokenIssuanceSet: 'MPTokenIssuanceSet',
  OracleDelete: 'OracleDelete',
  OracleSet: 'OracleSet',
  Payment: 'Payment',
  PaymentChannelClaim: 'PaymentChannelClaim',
  PaymentChannelCreate: 'PaymentChannelCreate',
  PaymentChannelFund: 'PaymentChannelFund',
  SetRegularKey: 'SetRegularKey',
  SignerListSet: 'SignerListSet',
  TicketCreate: 'TicketCreate',
  TrustSet: 'TrustSet',
  XChainAccountCreateCommit: 'XChainAccountCreateCommit',
  XChainAddAccountCreateAttestation: 'XChainAddAccountCreateAttestation',
  XChainAddClaimAttestation: 'XChainAddClaimAttestation',
  XChainClaim: 'XChainClaim',
  XChainCommit: 'XChainCommit',
  XChainCreateBridge: 'XChainCreateBridge',
  XChainCreateClaimID: 'XChainCreateClaimID',
  XChainModifyBridge: 'XChainModifyBridge',
} as const;

export type XrplTransactionType =
  (typeof XrplTransactionType)[keyof typeof XrplTransactionType];

/**
 * JSON-RPC request and response structs for the Xrpld and Clio methods this
 * snap calls. Request structs use `object` so unexpected fields are rejected.
 * Response structs use `type` so the server can add fields without failing
 * validation.
 */
export const LedgerState = {
  Validated: 'validated',
  Current: 'current',
  Closed: 'closed',
} as const;

export type LedgerState = (typeof LedgerState)[keyof typeof LedgerState];

/** Ledger selector accepted by account, ledger, and entry methods. */
export const LedgerIndexStruct = union([
  UnSignedIntegerStruct,
  literal(LedgerState.Validated),
  literal(LedgerState.Current),
  literal(LedgerState.Closed),
]);

export type LedgerIndex = Infer<typeof LedgerIndexStruct>;

const LedgerSelectionStruct = object({
  ledger_index: optional(LedgerIndexStruct),
  ledger_hash: optional(Hash256Struct),
});

/**
 * Marker for paginated methods.
 *
 * @see https://xrpl.org/docs/references/http-websocket-apis/api-conventions/markers-and-pagination
 */
const StringPageMarkerStruct = string();
const ObjectPageMarkerStruct = object({
  ledger: UnSignedIntegerStruct,
  seq: UnSignedIntegerStruct,
});

const PageMarkerStruct = union([
  StringPageMarkerStruct,
  ObjectPageMarkerStruct,
]);

export type PageMarker = Infer<typeof PageMarkerStruct>;
const PageLimitStruct = size(integer(), 10, 400);

/** `limit` accepted by paginated methods (server clamps to 10–400). */
export const PageRequestStruct = object({
  limit: optional(PageLimitStruct),
  marker: optional(PageMarkerStruct),
});

export type PageRequest = Infer<typeof PageRequestStruct>;

/**
 * Shared fields on every successful Xrpld/Clio `result`.
 *
 * `status` is always present. `validated` is omitted on some methods (e.g.
 * `submit`, `server_info`, `simulate`) and present on ledger-scoped reads.
 */
export const BaseRpcResultStruct = type({
  status: string(),
  validated: optional(boolean()),
  ledger_index: optional(UnSignedIntegerStruct),
  ledger_hash: optional(Hash256Struct),
});

export type BaseRpcResult = Infer<typeof BaseRpcResultStruct>;

/**
 * Base envelope for JSON-RPC responses: `result` plus optional top-level `warning`.
 */
export const BaseRpcResponseStruct = type({
  result: BaseRpcResultStruct,
  warning: optional(string()),
});

export type BaseRpcResponse = Infer<typeof BaseRpcResponseStruct>;

/**
 * Builds a full RPC envelope whose `result` is {@link BaseRpcResultStruct}
 * plus the method-specific fields. Method fields win on key conflicts.
 *
 * @param resultStruct - Method-specific `result` fields (`type({ ... })`).
 * @returns Envelope struct: `{ result, warning? }`.
 */
function mergeBaseRpcResponseStruct<RpcResponseResult>(
  resultStruct: Struct<RpcResponseResult>,
): Struct<
  BaseRpcResponse & {
    result: BaseRpcResult & RpcResponseResult;
  }
> {
  const methodSchema =
    Object.hasOwn(resultStruct, 'schema') &&
    typeof resultStruct.schema === 'object' &&
    resultStruct.schema !== null
      ? (resultStruct.schema as Record<string, Struct<unknown>>)
      : {};

  return assign(
    BaseRpcResponseStruct,
    type({
      result: assign(
        BaseRpcResultStruct,
        type({
          ...BaseRpcResultStruct.schema,
          ...methodSchema,
        }),
      ),
    }),
  ) as unknown as Struct<
    BaseRpcResponse & {
      result: BaseRpcResult & RpcResponseResult;
    }
  >;
}

/**
 * `account_info` params.
 *
 * @see https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_info
 */
export const AccountInfoRequestStruct = assign(
  LedgerSelectionStruct,
  object({
    account: XrplAddressStruct,
    signer_lists: optional(boolean()),
  }),
);

export type AccountInfoRequest = Infer<typeof AccountInfoRequestStruct>;

export const AccountFlagsStruct = type({
  defaultRipple: boolean(),
  depositAuth: boolean(),
  disableMasterKey: boolean(),
  disallowIncomingXRP: boolean(),
  globalFreeze: boolean(),
  noFreeze: boolean(),
  passwordSpent: boolean(),
  requireAuthorization: boolean(),
  requireDestinationTag: boolean(),
  disallowIncomingCheck: optional(boolean()),
  disallowIncomingNFTokenOffer: optional(boolean()),
  disallowIncomingPayChan: optional(boolean()),
  disallowIncomingTrustline: optional(boolean()),
  allowTrustLineClawback: optional(boolean()),
  allowTrustLineLocking: optional(boolean()),
});

export type AccountFlags = Infer<typeof AccountFlagsStruct>;

export const AccountInfoResponseStruct = mergeBaseRpcResponseStruct(
  type({
    account_data: type({
      Account: XrplAddressStruct,
      Balance: ValidXrplDropsStruct,
      Flags: UnSignedIntegerStruct,
      LedgerEntryType: literal('AccountRoot'),
      OwnerCount: UnSignedIntegerStruct,
      Sequence: UnSignedIntegerStruct,
      /**
       * Accounts whose base reserve this account pays. Omitted when zero.
       */
      SponsoringAccountCount: optional(UnSignedIntegerStruct),
      /**
       * Ledger objects this account sponsors for other accounts. Omitted when zero.
       */
      SponsoringOwnerCount: optional(UnSignedIntegerStruct),
      /**
       * Ledger objects this account owns that another account sponsors. Omitted when zero.
       */
      SponsoredOwnerCount: optional(UnSignedIntegerStruct),
      /**
       * Account paying this account's base reserve. Omitted when this account pays its own.
       */
      Sponsor: optional(XrplAddressStruct),
    }),
    account_flags: AccountFlagsStruct,
  }),
);

export type AccountInfoResponse = Infer<
  typeof AccountInfoResponseStruct
>['result'];

/**
 * `account_lines` params.
 *
 * @see https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_lines
 */
export const AccountLinesRequestStruct = assign(
  LedgerSelectionStruct,
  PageRequestStruct,
  object({
    account: XrplAddressStruct,
    peer: optional(XrplAddressStruct),
  }),
);

export type AccountLinesRequest = Infer<typeof AccountLinesRequestStruct>;

export const TrustLineStruct = type({
  account: XrplAddressStruct,
  // Balance can be negative for trust lines
  balance: SignedNumberStringStruct,
  currency: CurrencyCodeStruct,
  limit: UnSignedNumberStringStruct,
  quality_in: number(),
  quality_out: number(),
  no_ripple: optional(boolean()),
  no_ripple_peer: optional(boolean()),
  peer_authorized: optional(boolean()),
  /** This account froze the trust line. */
  freeze: optional(boolean()),
  /** The issuer froze the trust line. */
  freeze_peer: optional(boolean()),
});

export type TrustLine = Infer<typeof TrustLineStruct>;

export const AccountLinesResponseStruct = mergeBaseRpcResponseStruct(
  type({
    account: XrplAddressStruct,
    lines: array(TrustLineStruct),
    limit: optional(PageLimitStruct),
    marker: optional(PageMarkerStruct),
  }),
);

export type AccountLinesResponse = Infer<
  typeof AccountLinesResponseStruct
>['result'];

/**
 * `account_mptokens` params. Clio v2.7.0+ only; Xrpld does not serve this.
 *
 * @see https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/clio-methods/account_mptokens
 */
export const AccountMptokensRequestStruct = assign(
  LedgerSelectionStruct,
  PageRequestStruct,
  object({
    account: XrplAddressStruct,
  }),
);

export type AccountMptokensRequest = Infer<typeof AccountMptokensRequestStruct>;

export const AccountMptokenStruct = type({
  mpt_id: Hash256Struct,
  account: XrplAddressStruct,
  mpt_issuance_id: MptIssuanceIdStruct,
  mpt_amount: UnSignedIntegerStringStruct,
  locked_amount: optional(UnSignedIntegerStringStruct),
  mpt_authorized: optional(boolean()),
  /**
   * Issuer freeze. When true the holder cannot send this holding.
   * Unrelated to `locked_amount` (escrow).
   */
  mpt_locked: optional(boolean()),
});

export type AccountMptoken = Infer<typeof AccountMptokenStruct>;

export const AccountMptokensResponseStruct = mergeBaseRpcResponseStruct(
  type({
    account: XrplAddressStruct,
    mptokens: array(AccountMptokenStruct),
    limit: optional(PageLimitStruct),
    marker: optional(PageMarkerStruct),
  }),
);

export type AccountMptokensResponse = Infer<
  typeof AccountMptokensResponseStruct
>['result'];

/**
 * `ledger_entry` for an MPT issuance (`mpt_issuance`) or a holder object
 * (`mptoken` id, or `mptoken.account` + `mptoken.mpt_issuance_id`).
 *
 * @see https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/ledger-methods/ledger_entry
 */
export const MptIssuanceLedgerEntryRequestStruct = assign(
  LedgerSelectionStruct,
  object({
    mpt_issuance: MptIssuanceIdStruct,
  }),
);

export const MptHolderLedgerEntryRequestStruct = assign(
  LedgerSelectionStruct,
  object({
    mptoken: object({
      account: XrplAddressStruct,
      mpt_issuance_id: MptIssuanceIdStruct,
    }),
  }),
);

export const MptokenIndexLedgerEntryRequestStruct = assign(
  LedgerSelectionStruct,
  object({
    mptoken: Hash256Struct,
  }),
);

export const LedgerEntryRequestStruct = union([
  MptIssuanceLedgerEntryRequestStruct,
  MptHolderLedgerEntryRequestStruct,
  MptokenIndexLedgerEntryRequestStruct,
]);

export type LedgerEntryRequest = Infer<typeof LedgerEntryRequestStruct>;

export const MptIssuanceNodeStruct = type({
  LedgerEntryType: literal('MPTokenIssuance'),
  Flags: UnSignedIntegerStruct,
  Issuer: XrplAddressStruct,
  Sequence: UnSignedIntegerStruct,
  OutstandingAmount: UnSignedIntegerStringStruct,
  OwnerNode: string(),
  PreviousTxnID: Hash256Struct,
  PreviousTxnLgrSeq: UnSignedIntegerStruct,
  AssetScale: optional(size(integer(), 0, 255)),
  MaximumAmount: optional(UnSignedIntegerStringStruct),
  TransferFee: optional(size(integer(), 0, 50_000)),
  MPTokenMetadata: optional(string()),
  LockedAmount: optional(UnSignedIntegerStringStruct),
});

export type MptIssuanceNode = Infer<typeof MptIssuanceNodeStruct>;

export const MptHolderNodeStruct = type({
  LedgerEntryType: literal('MPToken'),
  Account: XrplAddressStruct,
  MPTokenIssuanceID: MptIssuanceIdStruct,
  Flags: UnSignedIntegerStruct,
  MPTAmount: defaulted(UnSignedIntegerStringStruct, '0'),
  OwnerNode: string(),
  PreviousTxnID: Hash256Struct,
  PreviousTxnLgrSeq: UnSignedIntegerStruct,
  LockedAmount: defaulted(UnSignedIntegerStringStruct, '0'),
});

export type MptHolderNode = Infer<typeof MptHolderNodeStruct>;

export const LedgerEntryResponseStruct = mergeBaseRpcResponseStruct(
  type({
    index: Hash256Struct,
    ledger_current_index: optional(UnSignedIntegerStruct),
    node: union([MptIssuanceNodeStruct, MptHolderNodeStruct]),
  }),
);

export type LedgerEntryResponse = Infer<
  typeof LedgerEntryResponseStruct
>['result'];

/**
 * `server_info` has no parameters. The response carries reserve requirements,
 * the reference transaction cost, and the server load factor.
 *
 * @see https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/server-info-methods/server_info
 */
export const ServerInfoRequestStruct = object({});

export type ServerInfoRequest = Infer<typeof ServerInfoRequestStruct>;

export const ValidatedLedgerInfoStruct = type({
  age: min(number(), 0),
  base_fee_xrp: min(number(), 0),
  hash: Hash256Struct,
  reserve_base_xrp: min(number(), 0),
  reserve_inc_xrp: min(number(), 0),
  seq: UnSignedIntegerStruct,
});

export type ValidatedLedgerInfo = Infer<typeof ValidatedLedgerInfoStruct>;

export const ServerInfoResponseStruct = mergeBaseRpcResponseStruct(
  type({
    info: type({
      load_factor: optional(min(number(), 0)),
      load_factor_server: optional(min(number(), 0)),
      validated_ledger: optional(ValidatedLedgerInfoStruct),
    }),
  }),
);

export type ServerInfoResponse = Infer<
  typeof ServerInfoResponseStruct
>['result'];

/**
 * `ledger` params. Omit both selectors to read the latest validated ledger.
 *
 * @see https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/ledger-methods/ledger
 */
export const LedgerRequestStruct = LedgerSelectionStruct;

export type LedgerRequest = Infer<typeof LedgerRequestStruct>;

export const LedgerResponseStruct = mergeBaseRpcResponseStruct(
  type({
    ledger: type({
      ledger_hash: Hash256Struct,
      ledger_index: UnSignedIntegerStruct,
      closed: optional(boolean()),
      close_time: optional(integer()),
      parent_hash: optional(Hash256Struct),
    }),
  }),
);

export type LedgerResponse = Infer<typeof LedgerResponseStruct>['result'];

/**
 * `deposit_authorized` params.
 *
 * @see https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/path-and-order-book-methods/deposit_authorized
 */
export const DepositAuthorizedRequestStruct = assign(
  LedgerSelectionStruct,
  object({
    source_account: XrplAddressStruct,
    destination_account: XrplAddressStruct,
    credentials: optional(array(Hash256Struct)),
  }),
);

export type DepositAuthorizedRequest = Infer<
  typeof DepositAuthorizedRequestStruct
>;

export const DepositAuthorizedResponseStruct = mergeBaseRpcResponseStruct(
  type({
    deposit_authorized: boolean(),
    source_account: XrplAddressStruct,
    destination_account: XrplAddressStruct,
    credentials: optional(array(Hash256Struct)),
  }),
);

export type DepositAuthorizedResponse = Infer<
  typeof DepositAuthorizedResponseStruct
>['result'];

/**
 * `tx` params.
 *
 * @see https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/tx
 */
export const TxRequestStruct = object({
  transaction: XrplTransactionHashStruct,
  min_ledger: optional(UnSignedIntegerStruct),
  max_ledger: optional(UnSignedIntegerStruct),
});

export type TxRequest = Infer<typeof TxRequestStruct>;

/**
 * RPC `tx_json` as returned by Xrpld / Clio (`tx`, `submit`, `account_tx`, simulate).
 *
 * Includes optional ledger `hash` and signatures. Unsigned build/autofill drafts
 * live in `services/transaction/api`.
 */
export const BaseTxJsonStruct = type({
  TransactionType: enums(
    Object.values(XrplTransactionType).filter(
      (transactionType) => transactionType !== XrplTransactionType.Batch,
    ),
  ),
  Account: XrplAddressStruct,
  hash: optional(XrplTransactionHashStruct),
  Fee: optional(ValidXrplDropsStruct),
  Sequence: optional(UnSignedIntegerStruct),
  SigningPubKey: optional(string()),
  TxnSignature: optional(string()),
  LastLedgerSequence: optional(UnSignedIntegerStruct),
  Flags: optional(UnSignedIntegerStruct),
  DestinationTag: optional(ValidDestinationTagStruct),
});

export const BaseTxJsonWithRawTransactionsStruct = assign(
  BaseTxJsonStruct,
  type({
    TransactionType: literal(XrplTransactionType.Batch),
    RawTransactions: optional(
      array(
        type({
          RawTransaction: assign(
            BaseTxJsonStruct,
            type({
              TicketSequence: optional(UnSignedIntegerStruct),
            }),
          ),
        }),
      ),
    ),
  }),
);

export const TxJsonStruct = union([
  BaseTxJsonStruct,
  BaseTxJsonWithRawTransactionsStruct,
]);

export type TxJson = Infer<typeof TxJsonStruct>;

/**
 * Transaction payload shared by `tx` results and `account_tx` entries.
 * API v2 places `hash` next to `tx_json` (not inside it).
 */
export const BaseTxResultStruct = type({
  hash: XrplTransactionHashStruct,
  meta: union([record(string(), unknown()), string()]),
  tx_json: optional(TxJsonStruct),
  ledger_index: optional(UnSignedIntegerStruct),
  ledger_hash: optional(Hash256Struct),
  close_time_iso: optional(string()),
});

export type BaseTxResult = Infer<typeof BaseTxResultStruct>;

export const BaseTxResponseStruct =
  mergeBaseRpcResponseStruct(BaseTxResultStruct);

export type BaseTxResponse = Infer<typeof BaseTxResponseStruct>['result'];

const DelegationFilterStruct = object({
  delegate_filter: string(),
  counter_party: optional(XrplAddressStruct),
});

/**
 * `account_tx` params.
 *
 * @see https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_tx
 */
export const FetchAccountTransactionsRequestStruct = object({
  account: XrplAddressStruct,
  tx_type: optional(string()),
  ledger_index_min: optional(min(integer(), -1)),
  ledger_index_max: optional(min(integer(), -1)),
  binary: optional(boolean()),
  forward: optional(boolean()),
  delegate: optional(DelegationFilterStruct),
  limit: optional(PageLimitStruct),
  marker: optional(PageMarkerStruct),
});

export type FetchAccountTransactionsRequest = Infer<
  typeof FetchAccountTransactionsRequestStruct
>;

export const FetchAccountTransactionsResponseStruct =
  mergeBaseRpcResponseStruct(
    type({
      transactions: array(BaseTxResultStruct),
      limit: optional(PageLimitStruct),
      marker: optional(PageMarkerStruct),
    }),
  );

export type FetchAccountTransactionsResponse = Infer<
  typeof FetchAccountTransactionsResponseStruct
>['result'];

/** JSON-RPC `result` object when Xrpld or Clio rejected the command. */
export const RpcErrorResponseStruct = type({
  error: nonempty(string()),
  error_code: optional(union([string(), integer()])),
  error_message: optional(string()),
  status: optional(literal('error')),
  warning: optional(string()),
});

export type RpcErrorResponse = Infer<typeof RpcErrorResponseStruct>;

/**
 * `simulate` params. Exactly one of `tx_blob` or `tx_json`. The transaction
 * must be unsigned. `object` rejects the other form so both cannot be set.
 *
 * @see https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/simulate
 */
export const SimulateBlobRequestStruct = object({
  tx_blob: HexStruct,
  binary: optional(boolean()),
});

export const SimulateJsonRequestStruct = object({
  tx_json: type({
    TransactionType: nonempty(string()),
    Account: XrplAddressStruct,
  }),
  binary: optional(boolean()),
});

export const SimulateRequestStruct = union([
  SimulateBlobRequestStruct,
  SimulateJsonRequestStruct,
]);

export type SimulateRequest = Infer<typeof SimulateRequestStruct>;

/**
 * Dry-run result. `tx_json` and `meta` are present for JSON output. `tx_blob`
 * and `meta_blob` are present when `binary` is true. `meta` is omitted when
 * the transaction would not be included in a ledger.
 */
export const SimulateResponseStruct = mergeBaseRpcResponseStruct(
  type({
    applied: boolean(),
    engine_result: nonempty(string()),
    engine_result_code: integer(),
    engine_result_message: string(),
    ledger_index: UnSignedIntegerStruct,
    tx_json: TxJsonStruct,
    tx_blob: optional(nonempty(string())),
    meta: optional(
      type({
        TransactionResult: optional(nonempty(string())),
      }),
    ),
    meta_blob: optional(nonempty(string())),
  }),
);

export type SimulateResponse = Infer<typeof SimulateResponseStruct>['result'];

/**
 * Submit transaction params.
 * `tx_blob` is a signed transaction.
 * `fail_hard` is always `true` so a local failure is not relayed.
 *
 * @see https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/submit
 */
export const SubmitRequestStruct = object({
  tx_blob: XrplTransactionStringStruct,
  fail_hard: literal(true),
});

export type SubmitRequest = Infer<typeof SubmitRequestStruct>;

export const SubmitResponseStruct = mergeBaseRpcResponseStruct(
  type({
    engine_result: nonempty(string()),
    engine_result_code: integer(),
    engine_result_message: string(),
    tx_blob: nonempty(string()),
    tx_json: TxJsonStruct,
    /**
     * API v2 places the transaction hash next to `tx_json`. Older responses
     * may still nest it under `tx_json.hash`.
     */
    hash: optional(XrplTransactionHashStruct),
    accepted: optional(boolean()),
    applied: optional(boolean()),
    broadcast: optional(boolean()),
    kept: optional(boolean()),
    queued: optional(boolean()),
    validated_ledger_index: optional(UnSignedIntegerStruct),
  }),
);

export type SubmitResponse = Infer<typeof SubmitResponseStruct>['result'];
