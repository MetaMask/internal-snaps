import { XrplSnapException } from '../../utils/errors';

/** Base for wallet-layer errors (derivation, signing, verification). */
export class WalletServiceException extends XrplSnapException {}

/**
 * Thrown when keypair derivation from entropy fails. Messages describe the failing
 * step without exposing sensitive Snap RPC details.
 */
export class KeyDerivationException extends WalletServiceException {
  constructor(message?: string) {
    super(`Key derivation failed.${message ? ` ${message}` : ''}`);
  }
}

/**
 * Thrown when the transaction cannot be signed.
 */
export class SignTransactionException extends WalletServiceException {
  constructor() {
    super('Failed to sign transaction');
  }
}

/**
 * Thrown when the message cannot be signed.
 */
export class SignMessageException extends WalletServiceException {
  constructor() {
    super('Failed to sign message');
  }
}
