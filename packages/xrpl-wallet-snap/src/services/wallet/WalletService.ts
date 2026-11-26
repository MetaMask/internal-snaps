import type { JsonSLIP10Node } from '@metamask/key-tree';
import { SLIP10Node } from '@metamask/key-tree';
import { remove0x } from '@metamask/utils';
import { Wallet as XrplWallet } from 'xrpl';

import { XRPL_SECP_CURVE } from '../../constants';
import {
  getBip32Entropy,
  rethrowIfInstanceElseThrow,
  XrplSnapException,
} from '../../utils';
import { KeyDerivationException } from './exceptions';
import { getDerivationPath } from './utils';
import { Wallet } from './Wallet';

type Slip10KeyMaterial = {
  privateKey?: string;
  publicKey?: string;
};

/**
 * Derives Xrpl signing material from keyring entropy.
 *
 * MetaMask `snap_getBip32Entropy` returns a {@link JsonSLIP10Node}: a secp256k1
 * private key (32-byte hex) and compressed public key. That is not a family
 * seed. xrpl.js builds the same wallet as BIP44 `fromMnemonic` with
 * `new Wallet(publicKey, '00' + privateKey)`.
 *
 * Network / on-chain account access lives in {@link OnChainAccountService} and
 * {@link NetworkService}.
 */
export class WalletService {
  /**
   * Derives an XRPL classic address from the given entropy source and derivation index.
   *
   * @param params - Options object.
   * @param params.index - The derivation index for the account.
   * @param params.entropySource - Entropy source ID (e.g. from keyring).
   * @returns A Promise that resolves to the derived classic address.
   * @throws {KeyDerivationException} If keypair derivation fails.
   */
  async deriveAddress(params: {
    index: number;
    entropySource: string;
  }): Promise<string> {
    const { index, entropySource } = params;
    const keypair = await this.#deriveKeypair({ index, entropySource });
    return keypair.address;
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
   * @returns A promise that resolves to the signing wallet.
   * @throws {KeyDerivationException} If keypair derivation fails.
   */
  async resolveWallet(params: {
    index: number;
    entropySource: string;
  }): Promise<Wallet> {
    const keypair = await this.#deriveKeypair(params);
    return new Wallet(keypair);
  }

  /**
   * Gets a wallet resolver function that resolves to a Wallet for the given index.
   *
   * @param entropySource - The entropy source to use for derivation.
   * @returns A function that resolves to a Wallet for the given index.
   * @throws {KeyDerivationException} If keypair derivation fails.
   */
  async getWalletResolver(
    entropySource: string,
  ): Promise<(index: number) => Promise<Wallet>> {
    const coinTypeNode = await this.#getRootNode(entropySource);
    return async (index: number) => {
      const keypair = await this.#deriveKeypairBySlip10Node(
        coinTypeNode,
        index,
      );
      return new Wallet(keypair);
    };
  }

  async #deriveKeypair({
    index,
    entropySource,
  }: {
    index: number;
    entropySource: string;
  }): Promise<XrplWallet> {
    try {
      const jsonNode = await this.#getJsonNodeByEntropy(entropySource, index);

      this.#assertNodeHasPrivateAndPublicKey(jsonNode);

      return this.#xrplFromSlip10Keys(jsonNode);
    } catch (error: unknown) {
      return rethrowIfInstanceElseThrow(
        error,
        [XrplSnapException, KeyDerivationException],
        new KeyDerivationException('Unable to derive keypair from entropy'),
      );
    }
  }

  async #getRootNode(entropySource: string): Promise<SLIP10Node> {
    try {
      const jsonNode = await this.#getJsonNodeByEntropy(entropySource);
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
  ): Promise<XrplWallet> {
    try {
      // BIP44 address index is unhardened (`m/44'/144'/0'/0/${index}`), matching
      // {@link getDerivationPath} and xrpl.js `fromMnemonic`.
      const derivedNode = await node.derive([`slip10:${index}`]);

      this.#assertNodeHasPrivateAndPublicKey(derivedNode);

      return this.#xrplFromSlip10Keys(derivedNode);
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
    index?: number,
  ): Promise<JsonSLIP10Node> {
    // getBip32Entropy already wrapped in an XRPL snap exception
    return getBip32Entropy({
      entropySource,
      path: this.#getDerivationPath(index),
      curve: XRPL_SECP_CURVE,
    });
  }

  #getDerivationPath(index?: number): string[] {
    return getDerivationPath(index).split('/');
  }

  #assertNodeHasPrivateAndPublicKey(
    node: Slip10KeyMaterial,
  ): asserts node is Slip10KeyMaterial & {
    privateKey: string;
    publicKey: string;
  } {
    if (!node.privateKey || !node.publicKey) {
      throw new KeyDerivationException('Derived node is missing key material');
    }
  }

  /**
   * Builds an xrpl.js wallet from MetaMask SLIP-10 secp256k1 key material.
   *
   * `Wallet.fromSeed` expects a base58 family seed (`s…`), not BIP32 key hex.
   * Pass the compressed public key and XRPL-prefixed private key (`00` + 32 bytes).
   *
   * @param node - Node with a 32-byte private key and compressed public key.
   * @returns Wallet whose `privateKey` is the XRPL `00`-prefixed hex form.
   */
  #xrplFromSlip10Keys(node: {
    privateKey: string;
    publicKey: string;
  }): XrplWallet {
    try {
      const privateKeyHex = remove0x(node.privateKey).toUpperCase();
      const publicKeyHex = remove0x(node.publicKey).toUpperCase();
      if (privateKeyHex.length !== 64) {
        throw new KeyDerivationException(
          'Derived private key must be 32 bytes',
        );
      }
      if (publicKeyHex.length !== 66) {
        throw new KeyDerivationException(
          'Derived public key must be a 33-byte compressed secp256k1 key',
        );
      }
      return new XrplWallet(publicKeyHex, `00${privateKeyHex}`);
    } catch (error: unknown) {
      if (error instanceof KeyDerivationException) {
        throw error;
      }
      throw new KeyDerivationException(
        'Unable to build Xrpl keypair from derived material',
      );
    }
  }
}
