import { verify as xrplVerify } from 'ripple-keypairs';
import type {
  Transaction as XrplTransaction,
  Wallet as XrplWallet,
} from 'xrpl';

import { bufferToUint8Array } from '../../utils/buffer';
import {
  createBip44XrplWallet,
  createTestWallet,
} from './__mocks__/wallet.fixtures';
import { SignMessageException, SignTransactionException } from './exceptions';
import { Wallet } from './Wallet';

function createPaymentTransaction(account: string): XrplTransaction {
  return {
    TransactionType: 'Payment',
    Account: account,
    Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
    Amount: '1',
    Fee: '12',
    Sequence: 1,
  };
}

function createFailingSigner(): XrplWallet {
  const base = createBip44XrplWallet(0);
  return {
    classicAddress: base.classicAddress,
    privateKey: base.privateKey,
    sign: () => {
      throw new Error('sign failed');
    },
  } as unknown as XrplWallet;
}

describe('Wallet', () => {
  describe('address', () => {
    it.each([0, 1, 2])(
      'returns the classic address for BIP44 index %s',
      (index) => {
        const wallet = createTestWallet(index);
        expect(wallet.address).toStrictEqual(
          createBip44XrplWallet(index).classicAddress,
        );
      },
    );
  });

  describe('secret', () => {
    it.each([0, 1, 2])(
      'returns the 00-prefixed private key for BIP44 index %s',
      (index) => {
        const wallet = createTestWallet(index);
        expect(wallet.secret).toStrictEqual(
          createBip44XrplWallet(index).privateKey,
        );
      },
    );
  });

  describe('signTransaction', () => {
    it('returns a signed blob and hash for a payment', () => {
      const wallet = createTestWallet(0);
      const result = wallet.signTransaction(
        createPaymentTransaction(wallet.address),
      );

      expect(result.signedTransaction).toMatch(/^[0-9A-F]+$/iu);
      expect(result.hash).toMatch(/^[0-9A-F]{64}$/iu);
    });

    it('signs a payment whose Account is not this wallet', () => {
      const wallet = createTestWallet(0);
      const otherAccount = createBip44XrplWallet(1).classicAddress;

      const result = wallet.signTransaction(
        createPaymentTransaction(otherAccount),
      );

      expect(result.signedTransaction).toMatch(/^[0-9A-F]+$/iu);
      expect(result.hash).toMatch(/^[0-9A-F]{64}$/iu);
    });

    it('throws SignTransactionException when the signer fails', () => {
      const wallet = new Wallet(createFailingSigner());

      expect(() =>
        wallet.signTransaction(createPaymentTransaction(wallet.address)),
      ).toThrow(SignTransactionException);
    });
  });

  describe('signMessage', () => {
    it.each(['hello xrpl', '', 'こんにちは'])(
      'returns a hex signature that verifies for %j',
      (message) => {
        const xrplWallet = createBip44XrplWallet(0);
        const wallet = new Wallet(xrplWallet);
        const signatureHex = wallet.signMessage(message);

        expect(signatureHex).toMatch(/^[0-9a-f]+$/iu);
        expect(
          xrplVerify(
            bufferToUint8Array(message, 'utf8').toString('hex'),
            signatureHex,
            xrplWallet.publicKey,
          ),
        ).toBe(true);
      },
    );

    it('returns a base64 signature equivalent to the hex form', () => {
      const wallet = createTestWallet(0);
      const message = 'hello xrpl';

      const signatureHex = wallet.signMessage(message, 'hex');
      const signatureBase64 = wallet.signMessage(message, 'base64');

      expect(signatureBase64).toMatch(/^[A-Za-z0-9+/]+=*$/u);
      expect(
        bufferToUint8Array(signatureBase64, 'base64').toString('hex'),
      ).toBe(signatureHex);
    });

    it('defaults encoding to hex', () => {
      const wallet = createTestWallet(0);
      const message = 'default encoding';

      expect(wallet.signMessage(message)).toBe(
        wallet.signMessage(message, 'hex'),
      );
    });

    it('is deterministic for the same message and key', () => {
      const wallet = createTestWallet(0);

      expect(wallet.signMessage('same')).toBe(wallet.signMessage('same'));
    });

    it('does not verify against a different wallet public key', () => {
      const signer = createBip44XrplWallet(0);
      const other = createBip44XrplWallet(1);
      const message = 'hello xrpl';
      const signatureHex = new Wallet(signer).signMessage(message);

      expect(
        xrplVerify(
          bufferToUint8Array(message, 'utf8').toString('hex'),
          signatureHex,
          other.publicKey,
        ),
      ).toBe(false);
    });

    it('throws SignMessageException when signing fails', () => {
      const base = createBip44XrplWallet(0);
      const wallet = new Wallet({
        classicAddress: base.classicAddress,
        privateKey: 'not-a-valid-private-key',
        publicKey: base.publicKey,
      } as unknown as XrplWallet);

      expect(() => wallet.signMessage('hello')).toThrow(SignMessageException);
    });
  });
});
