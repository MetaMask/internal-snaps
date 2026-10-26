/**
 * The known RPC error codes for the Stellar network.
 * The error code is shared with Horizon API and Soroban RPC.
 *
 * @see https://developers.stellar.org/docs/data/apis/horizon/api-reference/errors/result-codes/transactions
 */
export const KnownRpcError = {
  TxBadSeq: 'txBadSeq',
  TxBadAuth: 'txBadAuth',
  TxTooEarly: 'txTooEarly',
  TxTooLate: 'txTooLate',
  TxInsufficientFee: 'txInsufficientFee',
  TxInsufficientBalance: 'txInsufficientBalance',
  TxInsufficientReserve: 'txInsufficientReserve',
  TxFailed: 'txFailed',
  TxMissingOperation: 'txMissingOperation',
  TxInternalError: 'txInternalError',
  TxBadAuthExtra: 'txBadAuthExtra',
} as const;

export type KnownRpcError = (typeof KnownRpcError)[keyof typeof KnownRpcError];

/**
 * Account ledger fields from Soroban RPC `getAccountEntry`.
 *
 * `sequenceNumber` is `AccountEntry.seqNum` as a decimal string (same encoding
 * as SDK `rpc.Server.getAccount` / Horizon `sequence`).
 */
export type AccountLedgerMeta = {
  sequenceNumber: string;
  subentryCount: number;
  numSponsoring: number;
  numSponsored: number;
  /** Native XLM in stroops (`AccountEntry.balance`). */
  rawNativeBalance: string;
};
