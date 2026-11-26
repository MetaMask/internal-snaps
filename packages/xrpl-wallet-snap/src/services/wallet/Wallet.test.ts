import type { Transaction as XrplTransaction } from 'xrpl';

import {
  createBip44XrplWallet,
  createTestWallet,
} from './__mocks__/wallet.fixtures';
import { SignTransactionException } from './exceptions';
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

function createFailingSigner() {
  const base = createBip44XrplWallet(0);
  return {
    classicAddress: base.classicAddress,
    privateKey: base.privateKey,
    sign: () => {
      throw new Error('sign failed');
    },
  } as unknown as ConstructorParameters<typeof Wallet>[0];
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

    it('throws SignTransactionException when the signer fails', () => {
      const wallet = new Wallet(createFailingSigner());

      expect(() =>
        wallet.signTransaction(createPaymentTransaction(wallet.address)),
      ).toThrow(SignTransactionException);
    });
  });

  describe('signMessage', () => {
    it.each([
      { message: 'hello xrpl', encoding: 'hex' as const },
      { message: 'hello xrpl', encoding: 'base64' as const },
      { message: '', encoding: 'hex' as const },
    ])(
      'returns the message unchanged for encoding $encoding',
      ({ message, encoding }) => {
        const wallet = createTestWallet(0);
        expect(wallet.signMessage(message, encoding)).toStrictEqual(message);
      },
    );

    it('defaults encoding to hex and returns the message unchanged', () => {
      const wallet = createTestWallet(0);
      expect(wallet.signMessage('default encoding')).toStrictEqual(
        'default encoding',
      );
    });
  });
});
