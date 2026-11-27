import type {
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip2ChainId,
} from '../../api';
import type { XrplSnapExceptionOptions } from '../../utils/errors';
import { XrplSnapException } from '../../utils/errors';

export class TransactionServiceException extends XrplSnapException {}

/** Thrown when building or rebuilding a transaction fails (e.g. invalid asset or SDK error). */
export class TransactionBuilderException extends TransactionServiceException {}

export class TransactionAutofillerException extends TransactionServiceException {}

/** Thrown when deserializing a transaction fails. */
export class TransactionDeserializationException extends TransactionServiceException {
  constructor(options?: XrplSnapExceptionOptions) {
    super('Failed to deserialize transaction', options);
  }
}

/** Base for all transaction validation errors (simulation, trustlines, balances). */
export class TransactionValidationException extends TransactionServiceException {}

/**
 * Thrown when a caller-supplied CAIP-2 scope does not match the transaction envelope's network.
 */
export class TransactionScopeNotMatchException extends TransactionValidationException {
  readonly expectedScope: KnownCaip2ChainId;

  readonly transactionScope: KnownCaip2ChainId;

  constructor(
    expectedScope: KnownCaip2ChainId,
    transactionScope: KnownCaip2ChainId,
  ) {
    super(
      `Transaction scope ${transactionScope} does not match expected scope ${expectedScope}`,
    );
    this.expectedScope = expectedScope;
    this.transactionScope = transactionScope;
  }
}

/**
 * Thrown when a transaction is past its validity window
 * (e.g. `LastLedgerSequence` has already passed).
 */
export class TransactionExpireException extends TransactionValidationException {
  constructor(lastLedgerSequence: number) {
    super(`Transaction expired (LastLedgerSequence: ${lastLedgerSequence})`);
  }
}

export class UnsupportedTransactionTypeException extends TransactionValidationException {
  constructor(operationType: string) {
    super(`Unsupported operation type: ${operationType}`);
  }
}

/** Thrown when creating an account with a non-native asset is not supported. */
export class InvalidAssetForCreateAccountException extends TransactionValidationException {
  constructor(assetId: string) {
    super(`Create account with non-native asset ${assetId} is not supported`);
  }
}

/** Thrown when the destination account has `lsfRequireDestTag` and the payment omits `DestinationTag`. */
export class RequiresDestinationTagException extends TransactionValidationException {
  readonly destination: string;

  constructor(destination: string) {
    super(`Destination ${destination} requires a destination tag`);
    this.destination = destination;
  }
}

/** Thrown when `deposit_authorized` is false for the payment source and destination. */
export class DepositNotAuthorizedException extends TransactionValidationException {
  readonly source: string;

  readonly destination: string;

  constructor(source: string, destination: string) {
    super(`Account ${source} is not authorized to deposit to ${destination}`);
    this.source = source;
    this.destination = destination;
  }
}

/** Thrown when a holder-to-issuer trust line is frozen by the issuer. */
export class TrustlineFrozenException extends TransactionValidationException {
  readonly assetId: KnownCaip19AssetIdOrSlip44Id;

  readonly accountAddress: string;

  constructor(assetId: KnownCaip19AssetIdOrSlip44Id, accountAddress: string) {
    super(
      `Trustline for asset ${assetId} on account ${accountAddress} is frozen`,
    );
    this.assetId = assetId;
    this.accountAddress = accountAddress;
  }
}

/**
 * Thrown when a native payment that would create an account is below the
 * account reserve (1 XRP; sponsorship not modeled).
 */
export class InvalidAmountForCreateAccountException extends TransactionValidationException {
  constructor(amount: string) {
    super(
      `Invalid amount for create account: ${amount} — minimum starting balance is 1 XRP`,
    );
  }
}

/**
 * Thrown when a payment uses a trust line that exists but is not issuer-authorized
 * (`peer_authorized` / rippled peer authorization is false).
 */
export class TrustlineNotAuthorizedException extends TransactionValidationException {
  readonly assetId: KnownCaip19AssetIdOrSlip44Id;

  readonly accountAddress: string;

  constructor(assetId: KnownCaip19AssetIdOrSlip44Id, accountAddress: string) {
    super(
      `Trustline for asset ${assetId} on account ${accountAddress} is not authorized`,
    );
    this.assetId = assetId;
    this.accountAddress = accountAddress;
  }
}

/** Thrown when the trustline is not found. */
export class TrustlineNotFoundException extends TransactionValidationException {
  /** CAIP-19 asset id (or slip44 id for native) for the missing trustline. */
  readonly assetId: KnownCaip19AssetIdOrSlip44Id;

  /** XRPL classic address (`r…`) that lacks the trust line. */
  readonly accountAddress: string;

  /**
   * @param assetId - CAIP-19 (or slip44) id of the asset.
   * @param accountAddress - Classic address missing the trustline.
   */
  constructor(assetId: KnownCaip19AssetIdOrSlip44Id, accountAddress: string) {
    super(
      `Trustline not found for asset ${assetId} on account ${accountAddress}`,
    );
    this.assetId = assetId;
    this.accountAddress = accountAddress;
  }
}

/** Thrown when the payment would exceed the trustline limit on the destination account. */
export class TrustlineExceedLimitException extends TransactionValidationException {
  readonly assetId: KnownCaip19AssetIdOrSlip44Id;

  constructor(assetId: KnownCaip19AssetIdOrSlip44Id) {
    super(
      `Payment would exceed trustline limit for asset ${assetId} on destination`,
    );
    this.assetId = assetId;
  }
}

/** Thrown when the trustline removal fails. */
export class RemoveTrustlineWithNonZeroBalanceException extends TransactionValidationException {
  constructor(message: string) {
    super(`Failed to remove the trustline: ${message}`);
  }
}

/** Thrown when an MPT holding is not found for unauthorize / opt-out. */
export class MptHoldingNotFoundException extends TransactionValidationException {
  readonly assetId: KnownCaip19AssetIdOrSlip44Id;

  readonly accountAddress: string;

  /**
   * @param assetId - CAIP-19 MPT asset id.
   * @param accountAddress - Classic address missing the holding.
   */
  constructor(assetId: KnownCaip19AssetIdOrSlip44Id, accountAddress: string) {
    super(
      `MPT holding not found for asset ${assetId} on account ${accountAddress}`,
    );
    this.assetId = assetId;
    this.accountAddress = accountAddress;
  }
}

/** Thrown when MPT unauthorize fails because the holding still has balance. */
export class RemoveMptWithNonZeroBalanceException extends TransactionValidationException {
  constructor(message: string) {
    super(`Failed to remove the MPT holding: ${message}`);
  }
}

/**
 * Thrown when the account's spendable native (XRP) balance is below what the transaction requires
 * for fees, reserves, and native outflows (all in drops).
 */
export class InsufficientBalanceToCoverFeeException extends TransactionValidationException {
  readonly balance: string;

  readonly required: string;

  constructor(balance: string, required: string) {
    super(
      `Insufficient native balance for transaction: ${balance} drops available is less than ${required} drops required`,
    );
    this.balance = balance;
    this.required = required;
  }
}

/** Thrown when the account's native balance is below the required base reserve. */
export class InsufficientBalanceToCoverBaseReserveException extends TransactionValidationException {
  readonly balance: string;

  readonly required: string;

  constructor(balance: string, required: string) {
    super(
      `Insufficient native balance for transaction for base reserve: ${balance} drops available is less than ${required} drops required`,
    );
    this.balance = balance;
    this.required = required;
  }
}

/**
 * Thrown when the account's spendable balance for an asset is below the amount required
 * by the transaction. Native amounts are drops; IOU amounts are issued-currency units.
 */
export class InsufficientBalanceException extends TransactionValidationException {
  readonly balance: string;

  readonly required: string;

  readonly assetId: string;

  constructor(balance: string, required: string, assetId?: string) {
    super(
      `Insufficient asset balance for transaction: ${balance} available is less than ${required} required`,
    );
    this.balance = balance;
    this.required = required;
    this.assetId = assetId ?? '';
  }
}

/**
 * Thrown when a value cannot be used as an XRPL `DestinationTag` (UInt32).
 */
export class InvalidDestinationTagException extends TransactionValidationException {
  constructor() {
    super('Destination tag is invalid');
  }
}

/** Thrown when the keyring transaction builder fails to create a transaction. */
export class KeyringTransactionBuilderException extends TransactionServiceException {}
