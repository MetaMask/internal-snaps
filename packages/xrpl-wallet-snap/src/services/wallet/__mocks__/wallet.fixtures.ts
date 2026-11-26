import type { JsonSLIP10Node } from '@metamask/key-tree';
import { Wallet as XrplWallet } from 'xrpl';

import { Wallet } from '../Wallet';

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/**
 * BIP44 secp256k1 wallet for the test mnemonic at `m/44'/144'/0'/0/${index}`.
 *
 * @param index - Account index.
 * @returns xrpl.js wallet for that path.
 */
export function createBip44XrplWallet(index: number): XrplWallet {
  return XrplWallet.fromMnemonic(TEST_MNEMONIC, {
    derivationPath: `m/44'/144'/0'/0/${index}`,
  });
}

/**
 * Builds a MetaMask-shaped SLIP-10 JSON node from an xrpl.js wallet.
 *
 * MetaMask private keys are 32-byte hex (no XRPL `00` prefix).
 *
 * @param wallet - Wallet whose keys to embed.
 * @returns Json SLIP-10 node for `getBip32Entropy` mocks.
 */
export function createJsonSlip10NodeFromWallet(
  wallet: XrplWallet,
): JsonSLIP10Node {
  const privateKeyHex = wallet.privateKey.startsWith('00')
    ? wallet.privateKey.slice(2)
    : wallet.privateKey;

  return {
    depth: 5,
    parentFingerprint: 0,
    index: 0,
    privateKey: `0x${privateKeyHex}`,
    publicKey: `0x${wallet.publicKey}`,
    chainCode: `0x${'11'.repeat(32)}`,
    curve: 'secp256k1',
  };
}

/**
 * Snap {@link Wallet} wrapping an xrpl.js BIP44 wallet for the given index.
 *
 * @param index - Account index.
 * @returns Signing wallet.
 */
export function createTestWallet(index: number = 0): Wallet {
  return new Wallet(createBip44XrplWallet(index));
}

/**
 * Random classic address (not tied to the test mnemonic).
 *
 * @returns Classic address.
 */
export function createRandomXrplAddress(): string {
  return XrplWallet.generate().classicAddress;
}
