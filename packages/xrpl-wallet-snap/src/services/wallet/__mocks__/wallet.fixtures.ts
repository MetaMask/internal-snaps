import type { JsonSLIP10Node } from '@metamask/key-tree';
import { ECDSA, Wallet as XrplWallet } from 'xrpl';

import { Wallet } from '../Wallet';

export const TEST_MNEMONIC =
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
 * Deterministic ed25519 xrpl.js wallet for tests (not BIP44-mnemonic derived).
 *
 * @param index - Salt applied to a fixed seed so each index gets a distinct key.
 * @returns xrpl.js ed25519 wallet.
 */
export function createEd25519XrplWallet(index: number = 0): XrplWallet {
  const seedBytes = new Uint8Array(16);
  seedBytes.fill(0xab);
  seedBytes[15] = index;
  return XrplWallet.fromEntropy(seedBytes, { algorithm: ECDSA.ed25519 });
}

/**
 * Builds a MetaMask-shaped SLIP-10 JSON node from an xrpl.js wallet.
 *
 * MetaMask private keys are 32-byte hex (no XRPL `00` / `ED` prefix).
 * Public keys keep the curve form returned by MetaMask: compressed secp256k1
 * (33 bytes) or raw ed25519 (32 bytes, no `ED` prefix).
 *
 * @param wallet - Wallet whose keys to embed.
 * @returns Json SLIP-10 node for `getBip32Entropy` mocks.
 */
export function createJsonSlip10NodeFromWallet(
  wallet: XrplWallet,
): JsonSLIP10Node {
  const isEd25519 = wallet.privateKey.startsWith('ED');

  let privateKeyHex = wallet.privateKey;
  let publicKeyHex = wallet.publicKey;
  if (isEd25519) {
    privateKeyHex = wallet.privateKey.slice(2);
    publicKeyHex = wallet.publicKey.startsWith('ED')
      ? wallet.publicKey.slice(2)
      : wallet.publicKey;
  } else {
    privateKeyHex = wallet.privateKey.startsWith('00')
      ? wallet.privateKey.slice(2)
      : wallet.privateKey;
  }

  return {
    depth: 5,
    parentFingerprint: 0,
    index: 0,
    privateKey: `0x${privateKeyHex}`,
    publicKey: `0x${publicKeyHex}`,
    chainCode: `0x${'11'.repeat(32)}`,
    curve: isEd25519 ? 'ed25519' : 'secp256k1',
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
