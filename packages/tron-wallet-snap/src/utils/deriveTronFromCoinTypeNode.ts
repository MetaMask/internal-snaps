import {
  BIP44Node,
  type JsonBIP44Node,
  type UnhardenedBIP32Node,
} from '@metamask/key-tree';
import { hexToBytes } from '@metamask/utils';
import { computeAddress } from 'ethers';
import { TronWeb } from 'tronweb';

import { sanitizeSensitiveError } from './errors';

const DEFAULT_TRON_CHANGE_PATH = [`bip32:0'`, 'bip32:0'] as const;

/**
 * Builds a one-segment BIP-32 path for deriving from the cached change node.
 *
 * @param addressIndex - BIP-44 address index to derive.
 * @returns A path tuple containing the address index segment.
 */
function getAddressIndexPath(
  addressIndex: number,
): readonly [UnhardenedBIP32Node] {
  return [`bip32:${addressIndex}`];
}

/**
 * Maps an uncompressed secp256k1 public key hex string to a Tron base58 address.
 *
 * @param publicKey - Uncompressed public key with `0x` prefix (same format as key-tree nodes).
 * @returns The Tron address and raw public key bytes.
 */
function tronAddressFromPublicKeyHex(publicKey: string): {
  address: string;
  publicKeyBytes: Uint8Array;
} {
  const publicKeyBytes = hexToBytes(publicKey);
  const hexAddress = computeAddress(publicKey);
  const address = TronWeb.address.fromHex(hexAddress);

  if (!address) {
    throw new Error('Unable to derive address');
  }

  return { address, publicKeyBytes };
}

/**
 * Builds a reusable deriver for Tron addresses under `m/44'/195'/0'/0/i` from the
 * coin-type JSON at `m/44'/195'`, caching `0'/0` so each call only derives the
 * final address index.
 *
 * @param coinTypeNodeJson - JSON node from `snap_getBip32Entropy` at path `m/44'/195'`.
 * @returns A function that derives the Tron address for a given BIP-44 `address_index`.
 */
export async function createTronBip44AddressDeriver(
  coinTypeNodeJson: JsonBIP44Node,
): Promise<
  (addressIndex: number) => Promise<{
    address: string;
    publicKeyBytes: Uint8Array;
  }>
> {
  try {
    const coinTypeNode = await BIP44Node.fromJSON(coinTypeNodeJson);
    const changeNode = await coinTypeNode.derive(DEFAULT_TRON_CHANGE_PATH);

    return async (addressIndex: number) => {
      try {
        const addressNode = await changeNode.derive(
          getAddressIndexPath(addressIndex),
        );

        if (!addressNode.publicKey) {
          throw new Error('Unable to derive public key');
        }

        return tronAddressFromPublicKeyHex(addressNode.publicKey);
      } catch (error) {
        throw sanitizeSensitiveError(error);
      }
    };
  } catch (error) {
    throw sanitizeSensitiveError(error);
  }
}
