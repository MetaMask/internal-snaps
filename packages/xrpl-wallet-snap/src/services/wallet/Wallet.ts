import { Wallet as XrplWallet } from 'xrpl';
import type { Transaction as XrplTransaction } from 'xrpl';

import { SignTransactionException } from './exceptions';

/**
 * Handle over an xrpl.js wallet: transaction signing and private-key export.
 */
export class Wallet {
  readonly #signer: XrplWallet;

  constructor(signer: XrplWallet) {
    this.#signer = signer;
  }

  /**
   * The XRPL classic account address.
   *
   * @returns Classic address (`r…`).
   */
  get address(): string {
    return this.#signer.classicAddress;
  }

  /**
   * The XRPL secp256k1 private key hex (`00` + 32 bytes).
   *
   * Used by keyring `exportAccount`. This is not a family seed (`s…`).
   *
   * @returns Prefixed private-key hex.
   */
  get secret(): string {
    return this.#signer.privateKey;
  }

  /**
   * Signs the given transaction with this wallet's signer.
   *
   * @param tx - The transaction to sign.
   * @returns Signed transaction blob and hash.
   * @throws {SignTransactionException} If Xrpl SDK signing fails (details are not exposed).
   */
  signTransaction(tx: XrplTransaction): {
    signedTransaction: string;
    hash: string;
  } {
    try {
      // Allow to sign any transaction even if it is not initiated by this wallet
      const signedTxn = this.#signer.sign(tx);
      return {
        signedTransaction: signedTxn.tx_blob,
        hash: signedTxn.hash,
      };
    } catch {
      throw new SignTransactionException();
    }
  }

  /**
   * Signs the given message with this wallet's signer.
   *
   * @param message - The message to sign.
   * @param encoding - The encoding of the message.
   * @returns Signed message.
   */
  signMessage(message: string, encoding: 'hex' | 'base64' = 'hex'): string {
    // TODO: Implement the actual signing of the message.
    return message;
  }
}
