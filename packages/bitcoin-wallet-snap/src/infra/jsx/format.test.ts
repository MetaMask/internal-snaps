import { BdkErrorCode } from '@metamask/bitcoindevkit';
import enMessages from '@metamask/snap-networks-utils/locales/en.json';

import { CurrencyUnit } from '../../entities';
import { displayAmount, displayOrigin, errorCodeToLabel } from './format';

describe('errorCodeToLabel', () => {
  it('lowercases the first letter of the BdkErrorCode name', () => {
    expect(errorCodeToLabel(BdkErrorCode.FeeTooLow)).toBe('feeTooLow');
  });

  it('falls back to the unknownError label for unknown codes', () => {
    expect(errorCodeToLabel(999999)).toBe('unknownError');
  });

  it('has an English translation for every BdkErrorCode label', () => {
    const translationKeys = new Set(Object.keys(enMessages.messages));
    for (const name of Object.keys(BdkErrorCode).filter((key) =>
      Number.isNaN(Number(key)),
    )) {
      const code = BdkErrorCode[name as keyof typeof BdkErrorCode];
      expect(translationKeys).toContain(errorCodeToLabel(code));
    }
  });
});

describe('displayAmount', () => {
  it('displays one satoshi as a plain decimal', () => {
    expect(displayAmount(1n)).toBe('0.00000001');
  });

  it('preserves the currency suffix', () => {
    expect(displayAmount(77n, CurrencyUnit.Bitcoin)).toBe('0.00000077 BTC');
  });
});

describe('displayOrigin', () => {
  it('returns the known label for the internal "metamask" origin', () => {
    expect(displayOrigin('metamask')).toBe('MetaMask');
  });

  it('returns the known label for the "wallet-connect" origin', () => {
    expect(displayOrigin('wallet-connect')).toBe('WalletConnect');
  });

  it('matches known origins case-insensitively', () => {
    expect(displayOrigin('MetaMask')).toBe('MetaMask');
    expect(displayOrigin('Wallet-Connect')).toBe('WalletConnect');
  });

  it('returns the hostname for a valid https URL', () => {
    expect(displayOrigin('https://app.uniswap.org')).toBe('app.uniswap.org');
  });

  it('returns the hostname for a valid http URL', () => {
    expect(displayOrigin('http://localhost:8080')).toBe('localhost');
  });

  it('returns an empty string for a non-http(s) URL', () => {
    expect(displayOrigin('ftp://example.com')).toBe('');
  });

  it('returns an empty string for a WalletConnect channelId', () => {
    expect(
      displayOrigin(
        'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
      ),
    ).toBe('');
  });

  it('returns an empty string for an invalid origin', () => {
    expect(displayOrigin('not a url')).toBe('');
    expect(displayOrigin('')).toBe('');
  });
});
