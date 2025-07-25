import type { EntropySourceId } from '@metamask/keyring-api';
import { assert, pattern, string } from '@metamask/superstruct';
import { hexToBytes } from '@metamask/utils';
import { TronWeb } from 'tronweb';

import { getBip32Entropy } from './getBip32Entropy';
import logger from './logger';

/**
 * Validates a Tron derivation path following the format: m/44'/195'/...
 */
const DERIVATION_PATH_REGEX = /^m\/44'\/195'/u;
export const DerivationPathStruct = pattern(string(), DERIVATION_PATH_REGEX);

/**
 * Elliptic curve for TRON (same as Ethereum)
 */
const CURVE = 'secp256k1' as const;

/**
 * Derives a TRON private and public key from a given derivation path using BIP44.
 * The derivation path follows the format: m/44'/195'/account'/change/index
 * where 195 is TRON's coin type.
 *
 * @param params - The parameters for the TRON key derivation.
 * @param params.entropySource - The entropy source to use for key derivation.
 * @param params.derivationPath - The derivation path to use for key derivation.
 * @returns A Promise that resolves to the private key, public key, and address.
 * @throws {Error} If unable to derive private key or if derivation fails.
 * @example
 * ```typescript
 * const { privateKeyBytes, publicKeyBytes, address } = await deriveTronKeypair({
 *   derivationPath: "m/44'/195'/0'/0/0"
 * });
 * ```
 */
export async function deriveTronKeypair({
  entropySource,
  derivationPath,
}: {
  entropySource?: EntropySourceId | undefined;
  derivationPath: string;
}): Promise<{
  privateKeyBytes: Uint8Array;
  publicKeyBytes: Uint8Array;
  address: string;
}> {
  logger.log({ derivationPath }, 'Generating TRON wallet');

  assert(derivationPath, DerivationPathStruct);

  const path = derivationPath.split('/');

  try {
    const node = await getBip32Entropy({
      entropySource,
      path,
      curve: CURVE,
    });

    if (!node.privateKey || !node.publicKey) {
      throw new Error('Unable to derive private key');
    }

    const privateKeyBytes = hexToBytes(node.privateKey);
    const publicKeyBytes = hexToBytes(node.publicKey);

    const address = TronWeb.address.fromPrivateKey(node.privateKey.slice(2));

    if (!address) {
      throw new Error('Unable to derive address');
    }

    return {
      privateKeyBytes,
      publicKeyBytes,
      address,
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error deriving TRON keypair');
    throw new Error(`Failed to derive TRON keypair: ${error.message}`);
  }
}
