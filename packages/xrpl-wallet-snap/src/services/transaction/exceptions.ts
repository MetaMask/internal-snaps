import type {
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip2ChainId,
} from '../../api';
import type { XrplSnapExceptionOptions } from '../../utils/errors';
import { XrplSnapException } from '../../utils/errors';

/**
 * Base exception for the transaction service.
 */
export class TransactionServiceException extends XrplSnapException {}

/**
 * Thrown when building or rebuilding a transaction fails (e.g. invalid asset or SDK error).
 */
export class TransactionBuilderException extends TransactionServiceException {}

/**
 * Thrown when autofilling a transaction fails (e.g. missing Account for Sequence).
 */
export class TransactionAutofillerException extends TransactionServiceException {}

/**
 * Thrown when deserializing a transaction fails.
 */
export class TransactionDeserializationException extends TransactionServiceException {
  constructor(options?: XrplSnapExceptionOptions) {
    super('Failed to deserialize transaction', options);
  }
}

/**
 * Thrown when the keyring transaction builder fails to create a transaction.
 */
export class KeyringTransactionBuilderException extends TransactionServiceException {}

/**
 * Base for all transaction validation errors (simulation, trust lines, balances).
 */
export class TransactionValidationException extends TransactionServiceException {}

/**
 * Thrown when a caller-supplied CAIP-2 scope does not match the transaction envelope's network.
 */
export class TransactionScopeNotMatchException extends TransactionValidationException {
  readonly expectedScope: KnownCaip2ChainId;

  readonly transactionScope: KnownCaip2ChainId;

  /**
   * @param expectedScope - Scope the caller expected.
   * @param transactionScope - Scope carried by the transaction.
   */
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
  /**
   * @param lastLedgerSequence - The transaction's `LastLedgerSequence`.
   */
  constructor(lastLedgerSequence: number) {
    super(`Transaction expired (LastLedgerSequence: ${lastLedgerSequence})`);
  }
}

/**
 * Thrown when the transaction type or operation is not supported by the snap.
 */
export class UnsupportedTransactionTypeException extends TransactionValidationException {
  /**
   * @param operationType - Unsupported type or operation label.
   */
  constructor(operationType: string) {
    super(`Unsupported operation type: ${operationType}`);
  }
}

/**
 * Thrown when the destination account has `lsfRequireDestTag` and the payment omits `DestinationTag`.
 */
export class RequiresDestinationTagException extends TransactionValidationException {
  readonly destination: string;

  /**
   * @param destination - Classic address that requires a destination tag.
   */
  constructor(destination: string) {
    super(`Destination ${destination} requires a destination tag`);
    this.destination = destination;
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

/**
 * Thrown when `deposit_authorized` is false for the payment source and destination.
 */
export class DepositNotAuthorizedException extends TransactionValidationException {
  readonly source: string;

  readonly destination: string;

  /**
   * @param source - Payment source classic address.
   * @param destination - Payment destination classic address.
   */
  constructor(source: string, destination: string) {
    super(`Account ${source} is not authorized to deposit to ${destination}`);
    this.source = source;
    this.destination = destination;
  }
}

/**
 * Thrown when creating an account with a non-native asset is not supported.
 */
export class InvalidAssetForCreateAccountException extends TransactionValidationException {
  /**
   * @param assetId - Non-native asset id used in the create-account payment.
   */
  constructor(assetId: string) {
    super(`Create account with non-native asset ${assetId} is not supported`);
  }
}

/**
 * Thrown when a native payment that would create an account is below the
 * account reserve (1 XRP; sponsorship not modeled).
 */
export class InvalidAmountForCreateAccountException extends TransactionValidationException {
  /**
   * @param amount - Native amount in drops that was below the minimum.
   */
  constructor(amount: string) {
    super(
      `Invalid amount for create account: ${amount} — minimum starting balance is 1 XRP`,
    );
  }
}

/**
 * Thrown when the trust line is not found.
 */
export class TrustlineNotFoundException extends TransactionValidationException {
  /** CAIP-19 asset id (or slip44 id for native) for the missing trust line. */
  readonly assetId: KnownCaip19AssetIdOrSlip44Id;

  /** XRPL classic address (`r…`) that lacks the trust line. */
  readonly accountAddress: string;

  /**
   * @param assetId - CAIP-19 (or slip44) id of the asset.
   * @param accountAddress - Classic address missing the trust line.
   */
  constructor(assetId: KnownCaip19AssetIdOrSlip44Id, accountAddress: string) {
    super(
      `Trustline not found for asset ${assetId} on account ${accountAddress}`,
    );
    this.assetId = assetId;
    this.accountAddress = accountAddress;
  }
}

/**
 * Thrown when a payment uses a trust line that exists but is not issuer-authorized
 * (`peer_authorized` / rippled peer authorization is false).
 */
export class TrustlineNotAuthorizedException extends TransactionValidationException {
  readonly assetId: KnownCaip19AssetIdOrSlip44Id;

  readonly accountAddress: string;

  /**
   * @param assetId - CAIP-19 IOU asset id.
   * @param accountAddress - Classic address whose trust line is unauthorized.
   */
  constructor(assetId: KnownCaip19AssetIdOrSlip44Id, accountAddress: string) {
    super(
      `Trustline for asset ${assetId} on account ${accountAddress} is not authorized`,
    );
    this.assetId = assetId;
    this.accountAddress = accountAddress;
  }
}

/**
 * Thrown when a trust line or issued currency is frozen
 * (line freeze, peer freeze, or issuer `lsfGlobalFreeze`).
 */
export class TrustlineFrozenException extends TransactionValidationException {
  readonly assetId: KnownCaip19AssetIdOrSlip44Id;

  readonly accountAddress: string;

  /**
   * @param assetId - CAIP-19 IOU asset id.
   * @param accountAddress - Classic address associated with the freeze
   * (holder for a line freeze; issuer for a global freeze).
   */
  constructor(assetId: KnownCaip19AssetIdOrSlip44Id, accountAddress: string) {
    super(
      `Trustline for asset ${assetId} on account ${accountAddress} is frozen`,
    );
    this.assetId = assetId;
    this.accountAddress = accountAddress;
  }
}

/**
 * Thrown when the payment would exceed the trust line limit on the destination account.
 */
export class TrustlineExceedLimitException extends TransactionValidationException {
  readonly assetId: KnownCaip19AssetIdOrSlip44Id;

  /**
   * @param assetId - CAIP-19 IOU asset id whose destination limit would be exceeded.
   */
  constructor(assetId: KnownCaip19AssetIdOrSlip44Id) {
    super(
      `Payment would exceed trustline limit for asset ${assetId} on destination`,
    );
    this.assetId = assetId;
  }
}

/**
 * Thrown when trust line removal fails because the line still has a non-zero balance.
 */
export class RemoveTrustlineWithNonZeroBalanceException extends TransactionValidationException {
  /**
   * @param message - Detail about the remaining balance.
   */
  constructor(message: string) {
    super(`Failed to remove the trustline: ${message}`);
  }
}

/**
 * Thrown when an MPT holding is not found for unauthorize / opt-out.
 */
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

/**
 * Thrown when MPT unauthorize fails because the holding still has tokens
 * (`mptAmount` / `lockedAmount` non-zero).
 */
export class RemoveMptWithNonZeroBalanceException extends TransactionValidationException {
  /**
   * @param message - Detail about the remaining holding.
   */
  constructor(message: string) {
    super(`Failed to remove the MPT holding: ${message}`);
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

  /**
   * @param balance - Available balance (drops for native; issued units for IOU).
   * @param required - Required balance in the same units.
   * @param assetId - Optional CAIP-19 / slip44 asset id.
   */
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
 * Thrown when the account's spendable native (XRP) balance is below what the transaction
 * requires for fees (amounts in drops).
 */
export class InsufficientBalanceToCoverFeeException extends TransactionValidationException {
  readonly balance: string;

  readonly required: string;

  /**
   * @param balance - Spendable native balance in drops.
   * @param required - Required fee in drops.
   */
  constructor(balance: string, required: string) {
    super(
      `Insufficient native balance for transaction: ${balance} drops available is less than ${required} drops required`,
    );
    this.balance = balance;
    this.required = required;
  }
}

/**
 * Thrown when the account's native balance is below the required base / owner reserve.
 */
export class InsufficientBalanceToCoverBaseReserveException extends TransactionValidationException {
  readonly balance: string;

  readonly required: string;

  /**
   * @param balance - Spendable native balance in drops.
   * @param required - Required reserve in drops.
   */
  constructor(balance: string, required: string) {
    super(
      `Insufficient native balance for transaction for base reserve: ${balance} drops available is less than ${required} drops required`,
    );
    this.balance = balance;
    this.required = required;
  }
}
