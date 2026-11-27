import type { KnownCaip19MptAssetId, KnownCaip2ChainId } from '../../api';
import { XrplSnapException } from '../../utils/errors';
import type { XrplSnapExceptionOptions } from '../../utils/errors';

/** Base for all network-related errors (fees, account load, send, poll). */
export class NetworkServiceException extends XrplSnapException {}

/** Thrown when the account does not exist or is not funded on the network. */
export class AccountNotActivatedException extends NetworkServiceException {
  readonly address: string;

  readonly scope: KnownCaip2ChainId;

  constructor(
    address: string,
    scope: KnownCaip2ChainId,
    options?: XrplSnapExceptionOptions,
  ) {
    super(
      `Account not activated for address: ${address} for scope: ${scope}`,
      options,
    );
    this.address = address;
    this.scope = scope;
  }
}

/** Thrown when the destination account does not exist or is not funded on the network. */
export class DestinationAccountNotActivatedException extends AccountNotActivatedException {
  constructor(
    address: string,
    scope: KnownCaip2ChainId,
    options?: XrplSnapExceptionOptions,
  ) {
    super(address, scope, options);
    this.name = 'DestinationAccountNotActivatedException';
  }
}

/** Thrown when transaction submission to the network fails. */
export class TransactionSendException extends NetworkServiceException {
  readonly reference?: string;

  constructor(
    scope: KnownCaip2ChainId,
    reference?: string,
    options?: XrplSnapExceptionOptions,
  ) {
    super(
      `Failed to send transaction: scope: ${scope} ${reference ? ` reference: ${reference}` : ''}`,
      options,
    );
    this.reference = reference;
  }
}

/**
 * Submit failed with a sequence mismatch (`tefPAST_SEQ` / `terPRE_SEQ`).
 * Do not automatically submit another sequence; stop and determine why it mismatched.
 */
export class TransactionRetryableException extends TransactionSendException {}

/** Thrown when a transaction is not found. */
export class TransactionNotFoundException extends NetworkServiceException {
  readonly transactionHash: string;

  constructor(transactionHash: string, options?: XrplSnapExceptionOptions) {
    super(`Transaction ${transactionHash} not found`, options);
    this.transactionHash = transactionHash;
  }
}

/** Thrown when a ledger entry is not found. */
export class LedgerEntryNotFoundException extends NetworkServiceException {
  readonly assetId: KnownCaip19MptAssetId;

  constructor(
    assetId: KnownCaip19MptAssetId,
    options?: XrplSnapExceptionOptions,
  ) {
    super(`Ledger entry ${assetId} not found`, options);
    this.assetId = assetId;
  }
}

/** Thrown when a transaction simulation fails. */
export class SimulationException extends NetworkServiceException {
  constructor(message: string, options?: XrplSnapExceptionOptions) {
    super(`Failed to simulate transaction: ${message}`, options);
  }
}

/**
 * rippled or Clio accepted the HTTP request and returned a JSON-RPC error
 * (`actNotFound`, `txnNotFound`, and the rest).
 */
export class RpcResponseException extends NetworkServiceException {
  readonly method: string;

  readonly errorCode: string;

  constructor(
    method: string,
    errorCode: string,
    errorMessage?: string,
    options?: XrplSnapExceptionOptions,
  ) {
    super(
      errorMessage
        ? `${method} failed (${errorCode}): ${errorMessage}`
        : `${method} failed (${errorCode})`,
      options,
    );
    this.method = method;
    this.errorCode = errorCode;
  }
}
