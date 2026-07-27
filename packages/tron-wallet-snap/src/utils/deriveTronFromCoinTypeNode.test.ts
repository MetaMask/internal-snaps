import {
  BIP44CoinTypeNode,
  BIP44Node,
  BIP44PurposeNodeToken,
  mnemonicPhraseToBytes,
  type JsonBIP44Node,
} from '@metamask/key-tree';
import { hexToBytes } from '@metamask/utils';
import { computeAddress } from 'ethers';
import { TronWeb } from 'tronweb';

import { createTronBip44AddressDeriver } from './deriveTronFromCoinTypeNode';

jest.mock('tronweb', () => {
  const actualModule = jest.requireActual('tronweb');

  return {
    TronWeb: {
      address: {
        fromHex: jest.fn((addressHex: string) =>
          actualModule.TronWeb.address.fromHex(addressHex),
        ),
      },
    },
  };
});

const mockFromHex = jest.mocked(TronWeb.address.fromHex);
const actualTronWebModule = jest.requireActual('tronweb');

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const SANITIZED_DERIVATION_ERROR =
  'Key derivation failed. Please check your connection and try again.';

describe('createTronBip44AddressDeriver', () => {
  beforeEach(() => {
    mockFromHex.mockImplementation((addressHex: string) =>
      actualTronWebModule.TronWeb.address.fromHex(addressHex),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockFromHex.mockReset();
    mockFromHex.mockImplementation((addressHex: string) =>
      actualTronWebModule.TronWeb.address.fromHex(addressHex),
    );
  });

  it('matches full-path Tron addresses and public key bytes for indices 0–3', async () => {
    const seed = mnemonicPhraseToBytes(TEST_MNEMONIC);
    const coinTypeNode = await BIP44CoinTypeNode.fromDerivationPath([
      seed,
      BIP44PurposeNodeToken,
      `bip32:195'`,
    ]);
    const coinTypeJson = coinTypeNode.toJSON();
    const derive = await createTronBip44AddressDeriver(coinTypeJson);

    for (const addressIndex of [0, 1, 2, 3]) {
      const fullNode = await coinTypeNode.deriveBIP44AddressKey({
        account: 0,
        change: 0,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        address_index: addressIndex,
      });

      const expectedHex = computeAddress(fullNode.publicKey);
      const expectedAddress =
        actualTronWebModule.TronWeb.address.fromHex(expectedHex);

      const { address, publicKeyBytes } = await derive(addressIndex);

      expect(address).toBe(expectedAddress);
      expect(publicKeyBytes).toStrictEqual(hexToBytes(fullNode.publicKey));
    }
  });

  it('throws a sanitized error when TronWeb cannot encode the derived address', async () => {
    const coinNode = await BIP44CoinTypeNode.fromDerivationPath([
      mnemonicPhraseToBytes(TEST_MNEMONIC),
      BIP44PurposeNodeToken,
      `bip32:195'`,
    ]);
    const derive = await createTronBip44AddressDeriver(coinNode.toJSON());

    mockFromHex.mockReturnValueOnce(undefined as unknown as string);

    await expect(derive(0)).rejects.toThrow(SANITIZED_DERIVATION_ERROR);
  });

  it('throws a sanitized error when the derived node has no public key', async () => {
    const mockChangeNode = {
      derive: jest.fn().mockResolvedValue({ publicKey: undefined }),
    };
    const mockCoinTypeNode = {
      derive: jest.fn().mockResolvedValue(mockChangeNode),
    };

    jest
      .spyOn(BIP44Node, 'fromJSON')
      .mockResolvedValue(mockCoinTypeNode as never);

    const derive = await createTronBip44AddressDeriver({} as JsonBIP44Node);

    await expect(derive(0)).rejects.toThrow(SANITIZED_DERIVATION_ERROR);
  });

  it('sanitizes sensitive errors raised while deriving an address index', async () => {
    const mockChangeNode = {
      derive: jest
        .fn()
        .mockRejectedValue(new Error('failed to read private key')),
    };
    const mockCoinTypeNode = {
      derive: jest.fn().mockResolvedValue(mockChangeNode),
    };

    jest
      .spyOn(BIP44Node, 'fromJSON')
      .mockResolvedValue(mockCoinTypeNode as never);

    const derive = await createTronBip44AddressDeriver({} as JsonBIP44Node);

    await expect(derive(0)).rejects.toThrow(SANITIZED_DERIVATION_ERROR);
  });

  it('sanitizes sensitive errors raised while building the deriver', async () => {
    jest
      .spyOn(BIP44Node, 'fromJSON')
      .mockRejectedValue(new Error('invalid bip44 entropy'));

    await expect(
      createTronBip44AddressDeriver({} as JsonBIP44Node),
    ).rejects.toThrow(SANITIZED_DERIVATION_ERROR);
  });

  it('re-throws non-sensitive errors from coin type JSON parsing', async () => {
    jest
      .spyOn(BIP44Node, 'fromJSON')
      .mockRejectedValue(new Error('unexpected parse failure'));

    await expect(
      createTronBip44AddressDeriver({} as JsonBIP44Node),
    ).rejects.toThrow('unexpected parse failure');
  });
});
