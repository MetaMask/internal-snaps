import { SLIP10Node } from '@metamask/key-tree';
import type { JsonSLIP10Node } from '@metamask/key-tree';
import type { EntropySourceId } from '@metamask/keyring-api';

/**
 * Retrieves a `SLIP10NodeInterface` object for the specified path and curve.
 *
 * @param params - The parameters for the Solana key derivation.
 * @param params.entropySource - The entropy source to use for key derivation.
 * @param params.path - The BIP32 derivation path for which to retrieve a `SLIP10NodeInterface`.
 * @param params.curve - The elliptic curve to use for key derivation.
 * @returns A Promise that resolves to a `SLIP10NodeInterface` object.
 */
export async function getBip32Entropy({
  entropySource,
  path,
  curve,
}: {
  entropySource?: EntropySourceId | undefined;
  path: string[];
  curve: 'secp256k1' | 'ed25519';
}): Promise<JsonSLIP10Node> {
  const node = await snap.request({
    method: 'snap_getBip32Entropy',
    params: {
      path,
      curve,
      ...(entropySource ? { source: entropySource } : {}),
    },
  });

  return node;
}

/**
 * Retrieves the Solana coin-type node (`m/44'/501'`) for an entropy source.
 *
 * @param entropySource - The entropy source to use for key derivation.
 * @returns A Promise that resolves to the Solana coin-type `SLIP10Node`.
 */
export async function getSolanaCoinTypeNode(
  entropySource?: EntropySourceId | undefined,
): Promise<SLIP10Node> {
  const coinTypeNodeJson = await getBip32Entropy({
    entropySource,
    path: ['m', "44'", "501'"],
    curve: 'ed25519',
  });

  return await SLIP10Node.fromJSON(coinTypeNodeJson);
}
