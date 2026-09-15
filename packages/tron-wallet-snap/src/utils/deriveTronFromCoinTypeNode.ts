import { BIP44Node } from '@metamask/key-tree';
import type { JsonBIP44Node, UnhardenedBIP32Node } from '@metamask/key-tree';
import { hexToBytes } from '@metamask/utils';
import { computeAddress } from 'ethers';
import { TronWeb } from 'tronweb';

import { sanitizeSensitiveError } from './errors';

const DEFAULT_TRON_CHANGE_PATH = [`bip32:0'`, 'bip32:0'] as const;

type TronBip44ChangeNode = Awaited<
  ReturnType<Awaited<ReturnType<typeof BIP44Node.fromJSON>>['derive']>
>;

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
 * Maps a derived BIP-32 address node to Tron keypair material.
 *
 * @param addressNode - Node derived at `m/44'/195'/0'/0/i`.
 * @param addressNode.privateKey - Private key for the derived address node.
 * @param addressNode.publicKey - Public key for the derived address node.
 * @returns The Tron keypair material used for signing.
 */
function tronKeypairFromAddressNode(addressNode: {
  privateKey?: string;
  publicKey?: string;
}): {
  address: string;
  privateKeyBytes: Uint8Array;
  publicKeyBytes: Uint8Array;
  privateKeyHex: string;
} {
  if (!addressNode.privateKey || !addressNode.publicKey) {
    throw new Error('Unable to derive private key');
  }

  const { address, publicKeyBytes } = tronAddressFromPublicKeyHex(
    addressNode.publicKey,
  );
  const privateKeyBytes = hexToBytes(addressNode.privateKey);
  const privateKeyHex = addressNode.privateKey.slice(2);

  return {
    address,
    privateKeyBytes,
    publicKeyBytes,
    privateKeyHex,
  };
}

/**
 * Creates the cached Tron change node at `m/44'/195'/0'/0`.
 *
 * @param coinTypeNodeJson - JSON node from `snap_getBip32Entropy` at path `m/44'/195'`.
 * @returns The derived change node used by Tron account/address derivers.
 */
async function createTronBip44ChangeNode(
  coinTypeNodeJson: JsonBIP44Node,
): Promise<TronBip44ChangeNode> {
  const coinTypeNode = await BIP44Node.fromJSON(coinTypeNodeJson);
  return coinTypeNode.derive(DEFAULT_TRON_CHANGE_PATH);
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
    const changeNode = await createTronBip44ChangeNode(coinTypeNodeJson);

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

/**
 * Builds a reusable deriver for Tron keypairs under `m/44'/195'/0'/0/i` from
 * the coin-type JSON at `m/44'/195'`, caching `0'/0` so each call only derives
 * the final address index.
 *
 * @param coinTypeNodeJson - JSON node from `snap_getBip32Entropy` at path `m/44'/195'`.
 * @returns A function that derives the Tron keypair for a given BIP-44 `address_index`.
 */
export async function createTronBip44KeypairDeriver(
  coinTypeNodeJson: JsonBIP44Node,
): Promise<
  (addressIndex: number) => Promise<{
    address: string;
    privateKeyBytes: Uint8Array;
    publicKeyBytes: Uint8Array;
    privateKeyHex: string;
  }>
> {
  try {
    const changeNode = await createTronBip44ChangeNode(coinTypeNodeJson);

    return async (addressIndex: number) => {
      try {
        const addressNode = await changeNode.derive(
          getAddressIndexPath(addressIndex),
        );

        return tronKeypairFromAddressNode(addressNode);
      } catch (error) {
        throw sanitizeSensitiveError(error);
      }
    };
  } catch (error) {
    throw sanitizeSensitiveError(error);
  }
}
