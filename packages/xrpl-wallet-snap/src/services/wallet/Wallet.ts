import { sign as xrplSignFn } from 'ripple-keypairs';
import { Wallet as XrplWallet } from 'xrpl';
import type { Transaction as XrplTransaction } from 'xrpl';

import { bufferToUint8Array } from '../../utils/buffer';
import { SignMessageException, SignTransactionException } from './exceptions';

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
   * The XRPL private key hex.
   *
   * Used by keyring `exportAccount`.
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
   * Signs the given UTF-8 message with the wallet private key.
   *
   * @param message - The UTF-8 message to sign.
   * @param encode - Encoding for the returned signature. Defaults to `'hex'`.
   * @returns The signature as hex or base64.
   * @throws {SignMessageException} If signing fails (details are not exposed).
   */
  signMessage(message: string, encode: 'hex' | 'base64' = 'hex'): string {
    try {
      const messageHex = bufferToUint8Array(message, 'utf8').toString('hex');
      const signatureHex = xrplSignFn(messageHex, this.#signer.privateKey);

      return bufferToUint8Array(signatureHex, 'hex').toString(encode);
    } catch {
      throw new SignMessageException();
    }
  }
}
