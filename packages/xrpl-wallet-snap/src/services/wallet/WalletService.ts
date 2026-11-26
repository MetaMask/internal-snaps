import type { JsonSLIP10Node, SLIP10PathTuple } from '@metamask/key-tree';
import { SLIP10Node } from '@metamask/key-tree';
import { getBip32Entropy } from '@metamask/snap-networks-utils';
import { remove0x } from '@metamask/utils';
import { Wallet as XrplWallet } from 'xrpl';

import { XRPL_ED25519_CURVE, XRPL_SECP_CURVE } from '../../constants';
import { bufferToUint8Array } from '../../utils/buffer';
import {
  rethrowIfInstanceElseThrow,
  XrplSnapException,
} from '../../utils/errors';
import type { XrplCurve } from './api';
import { KeyDerivationException } from './exceptions';
import { getDerivationPath } from './utils';
import { Wallet } from './Wallet';

/**
 * Derives Xrpl signing material from keyring entropy.
 */
export class WalletService {
  /**
   * Derives an XRPL classic address from the given entropy source and derivation index.
   *
   * @param params - Options object.
   * @param params.index - The derivation index for the account.
   * @param params.entropySource - Entropy source ID (e.g. from keyring).
   * @param params.curve - Signing curve. Defaults to secp256k1.
   * @returns A Promise that resolves to the derived classic address.
   * @throws {KeyDerivationException} If keypair derivation fails.
   */
  async deriveAddress(params: {
    index: number;
    entropySource: string;
    curve?: XrplCurve;
  }): Promise<string> {
    const wallet = await this.resolveWallet(params);
    return wallet.address;
  }

  /**
   * Builds a signing {@link Wallet} for the given entropy source and derivation index.
   *
   * Callers that own a keyring account identity should verify the derived
   * address against the stored address themselves.
   *
   * @param params - Options object.
   * @param params.index - The derivation index for the account.
   * @param params.entropySource - Entropy source ID (e.g. from keyring).
   * @param params.curve - Signing curve. Defaults to secp256k1.
   * @returns A promise that resolves to the signing wallet.
   * @throws {KeyDerivationException} If keypair derivation fails.
   */
  async resolveWallet(params: {
    index: number;
    entropySource: string;
    curve?: XrplCurve;
  }): Promise<Wallet> {
    return this.#deriveKeypair(params);
  }

  /**
   * Gets a wallet resolver function that resolves to a Wallet for the given index.
   *
   * @param entropySource - The entropy source to use for derivation.
   * @param curve - Signing curve. Defaults to secp256k1.
   * @returns A function that resolves to a Wallet for the given index.
   * @throws {KeyDerivationException} If keypair derivation fails.
   */
  async getWalletResolver(
    entropySource: string,
    curve: XrplCurve = XRPL_SECP_CURVE,
  ): Promise<(index: number) => Promise<Wallet>> {
    const coinTypeNode = await this.#getRootNode(entropySource, curve);
    return async (index: number): Promise<Wallet> => {
      return this.#deriveKeypairBySlip10Node(coinTypeNode, index, curve);
    };
  }

  async #deriveKeypair({
    index,
    entropySource,
    curve = XRPL_SECP_CURVE,
  }: {
    index: number;
    entropySource: string;
    curve?: XrplCurve;
  }): Promise<Wallet> {
    try {
      const resolver = await this.getWalletResolver(entropySource, curve);
      return await resolver(index);
    } catch (error: unknown) {
      return rethrowIfInstanceElseThrow(
        error,
        [XrplSnapException, KeyDerivationException],
        new KeyDerivationException('Unable to derive keypair from entropy'),
      );
    }
  }

  async #getRootNode(
    entropySource: string,
    curve: XrplCurve,
  ): Promise<SLIP10Node> {
    try {
      const jsonNode = await this.#getJsonNodeByEntropy(
        entropySource,
        undefined,
        curve,
      );
      const coinTypeNode = await SLIP10Node.fromJSON(jsonNode);
      return coinTypeNode;
    } catch (error: unknown) {
      return rethrowIfInstanceElseThrow(
        error,
        [XrplSnapException, KeyDerivationException],
        new KeyDerivationException('Unable to load coin-type derivation node'),
      );
    }
  }

  async #deriveKeypairBySlip10Node(
    node: SLIP10Node,
    index: number,
    curve: XrplCurve,
  ): Promise<Wallet> {
    try {
      // secp256k1 address index is unhardened (`…/0'/0/${index}`).
      // ed25519 address index is hardened (`…/0'/0'/${index}'`).
      const pathSegment: SLIP10PathTuple =
        curve === XRPL_ED25519_CURVE
          ? [`slip10:${index}'`]
          : [`slip10:${index}`];
      const derivedNode = await node.derive(pathSegment);

      return await this.#xrplFromSlip10Keys(derivedNode, curve);
    } catch (error: unknown) {
      return rethrowIfInstanceElseThrow(
        error,
        [KeyDerivationException],
        new KeyDerivationException('Unable to derive keypair at account index'),
      );
    }
  }

  async #getJsonNodeByEntropy(
    entropySource: string,
    index: number | undefined,
    curve: XrplCurve,
  ): Promise<JsonSLIP10Node> {
    // getBip32Entropy already wrapped in an XRPL snap exception
    return getBip32Entropy({
      entropySource,
      path: getDerivationPath(index, curve).split('/'),
      curve,
    });
  }

  #assertNodeHasPrivateAndPublicKey(
    node: SLIP10Node,
  ): asserts node is SLIP10Node & {
    privateKey: string;
    publicKey: string;
  } {
    if (!node.privateKey || !node.publicKey) {
      throw new KeyDerivationException('Derived node is missing key material');
    }

    const privateKeyHex = remove0x(node.privateKey).toUpperCase();

    if (privateKeyHex.length !== 64) {
      throw new KeyDerivationException('Derived private key must be 32 bytes');
    }
  }

  /**
   * Builds an xrpl.js wallet from MetaMask SLIP-10 key material.
   *
   * @param node - Node with a 32-byte private key and curve-appropriate public key.
   * @param curve - Signing curve used to choose XRPL key prefixes.
   * @returns Wallet with XRPL-prefixed private/public keys.
   */
  async #xrplFromSlip10Keys(
    node: SLIP10Node,
    curve: XrplCurve,
  ): Promise<Wallet> {
    try {
      if (curve === XRPL_ED25519_CURVE) {
        return this.#ed25519FromSlip10Keys(node);
      }

      if (curve === XRPL_SECP_CURVE) {
        return this.#secp256k1FromSlip10Keys(node);
      }

      throw new KeyDerivationException('Invalid curve');
    } catch (error: unknown) {
      return rethrowIfInstanceElseThrow(
        error,
        [KeyDerivationException],
        new KeyDerivationException(
          'Unable to build Xrpl keypair from derived material',
        ),
      );
    }
  }

  #ed25519FromSlip10Keys(node: SLIP10Node): Wallet {
    this.#assertNodeHasPrivateAndPublicKey(node);
    const publicKeyHex = remove0x(node.publicKey).toUpperCase();
    const privateKeyHex = remove0x(node.privateKey).toUpperCase();

    // MetaMask SLIP-10 ed25519 public keys are 33 bytes (`00` || raw key).
    // XRPL keys may already be `ED`-prefixed.
    const edPublicKeyHex =
      (publicKeyHex.startsWith('ED') || publicKeyHex.startsWith('00')) &&
      publicKeyHex.length === 66
        ? publicKeyHex.slice(2)
        : publicKeyHex;
    if (edPublicKeyHex.length !== 64) {
      throw new KeyDerivationException(
        'Derived public key must be a 32-byte ed25519 key',
      );
    }
    return new Wallet(
      new XrplWallet(`ED${edPublicKeyHex}`, `ED${privateKeyHex}`),
    );
  }

  #secp256k1FromSlip10Keys(node: SLIP10Node): Wallet {
    this.#assertNodeHasPrivateAndPublicKey(node);

    const privateKeyHex = remove0x(node.privateKey).toUpperCase();
    let publicKeyHex = remove0x(node.publicKey).toUpperCase();

    // 65 bytes public key (04 || x || y) refers to an uncompressed public key.
    if (publicKeyHex.length === 130 && publicKeyHex.startsWith('04')) {
      // Convert the uncompressed public key to a compressed public key.
      publicKeyHex = bufferToUint8Array(node.compressedPublicKeyBytes).toString(
        'hex',
      );
    }

    if (publicKeyHex.length !== 66) {
      throw new KeyDerivationException(
        'Derived public key must be a 33-byte compressed secp256k1 key',
      );
    }
    return new Wallet(new XrplWallet(publicKeyHex, `00${privateKeyHex}`));
  }
}
