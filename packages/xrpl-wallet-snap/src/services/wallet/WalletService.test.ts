import type { JsonSLIP10Node } from '@metamask/key-tree';
import { SLIP10Node } from '@metamask/key-tree';
import * as SnapUtils from '@metamask/snap-networks-utils';
import type { MockInstance } from 'vitest';
import { Wallet } from 'xrpl';

import { XRPL_ED25519_CURVE, XRPL_SECP_CURVE } from '../../constants';
import { XrplSnapException } from '../../utils/errors';
import {
  createBip44XrplWallet,
  createEd25519XrplWallet,
  createJsonSlip10NodeFromWallet,
} from './__mocks__/wallet.fixtures';
import { KeyDerivationException } from './exceptions';
import { getDerivationPath } from './utils';
import { WalletService } from './WalletService';

function createWalletServiceTest({
  jsonNode = createJsonSlip10NodeFromWallet(createBip44XrplWallet(0)),
  getBip32EntropyError,
}: {
  jsonNode?: JsonSLIP10Node;
  getBip32EntropyError?: Error;
} = {}): {
  service: WalletService;
  getBip32Entropy: MockInstance<typeof SnapUtils.getBip32Entropy>;
} {
  const getBip32Entropy = vi.spyOn(SnapUtils, 'getBip32Entropy');
  if (getBip32EntropyError) {
    getBip32Entropy.mockRejectedValue(getBip32EntropyError);
  } else {
    getBip32Entropy.mockResolvedValue(jsonNode);
  }

  return {
    service: new WalletService(),
    getBip32Entropy,
  };
}

function createDerivedSlip10Node(wallet = createBip44XrplWallet(0)): {
  privateKey?: string;
  publicKey?: string;
} {
  const node = createJsonSlip10NodeFromWallet(wallet);
  return {
    privateKey: node.privateKey,
    publicKey: node.publicKey,
  };
}

describe('WalletService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('deriveAddress', () => {
    it('derives the BIP44 classic address and requests entropy for the prefix path', async () => {
      const expected = createBip44XrplWallet(0);
      const deriveChild = vi
        .fn()
        .mockResolvedValue(createDerivedSlip10Node(expected));
      const { service, getBip32Entropy } = createWalletServiceTest();
      vi.spyOn(SLIP10Node, 'fromJSON').mockResolvedValue({
        derive: deriveChild,
      } as unknown as SLIP10Node);

      const address = await service.deriveAddress({
        index: 0,
        entropySource: 'entropy-source-1',
      });

      expect(address).toStrictEqual(expected.classicAddress);
      expect(getBip32Entropy).toHaveBeenCalledWith({
        entropySource: 'entropy-source-1',
        path: getDerivationPath().split('/'),
        curve: XRPL_SECP_CURVE,
      });
      expect(deriveChild).toHaveBeenCalledWith(['slip10:0']);
    });

    it('derives an ed25519 classic address when curve is ed25519', async () => {
      const expected = createEd25519XrplWallet(0);
      const deriveChild = vi
        .fn()
        .mockResolvedValue(createDerivedSlip10Node(expected));
      const { service, getBip32Entropy } = createWalletServiceTest({
        jsonNode: createJsonSlip10NodeFromWallet(expected),
      });
      vi.spyOn(SLIP10Node, 'fromJSON').mockResolvedValue({
        derive: deriveChild,
      } as unknown as SLIP10Node);

      const address = await service.deriveAddress({
        index: 0,
        entropySource: 'entropy-source-1',
        curve: XRPL_ED25519_CURVE,
      });

      expect(address).toStrictEqual(expected.classicAddress);
      expect(getBip32Entropy).toHaveBeenCalledWith({
        entropySource: 'entropy-source-1',
        path: getDerivationPath(undefined, XRPL_ED25519_CURVE).split('/'),
        curve: XRPL_ED25519_CURVE,
      });
      expect(deriveChild).toHaveBeenCalledWith(["slip10:0'"]);
    });

    it.each([
      {
        name: 'generic entropy failure',
        error: new Error('something went wrong'),
        expected: new KeyDerivationException(
          'Unable to load coin-type derivation node',
        ),
      },
      {
        name: 'XrplSnapException from getBip32Entropy',
        error: new XrplSnapException('Failed to get BIP32 entropy from Snap'),
        expected: new XrplSnapException(
          'Failed to get BIP32 entropy from Snap',
        ),
      },
    ])('rethrows $name from deriveAddress', async ({ error, expected }) => {
      const { service } = createWalletServiceTest({
        getBip32EntropyError: error,
      });

      await expect(
        service.deriveAddress({
          index: 0,
          entropySource: 'entropy-source-1',
        }),
      ).rejects.toThrow(expected);
    });

    it.each([
      {
        name: 'missing private key',
        patch: { privateKey: undefined },
        expectedMessage: 'Derived node is missing key material',
      },
      {
        name: 'missing public key',
        patch: { publicKey: undefined },
        expectedMessage: 'Derived node is missing key material',
      },
      {
        name: 'private key not 32 bytes',
        patch: { privateKey: '0xabcd' },
        expectedMessage: 'Derived private key must be 32 bytes',
      },
      {
        name: 'public key not compressed secp256k1',
        patch: {
          publicKey: `0x${'11'.repeat(32)}`,
        },
        expectedMessage:
          'Derived public key must be a 33-byte compressed secp256k1 key',
      },
    ])(
      'throws KeyDerivationException when $name',
      async ({ patch, expectedMessage }) => {
        const { service } = createWalletServiceTest();
        vi.spyOn(SLIP10Node, 'fromJSON').mockResolvedValue({
          derive: vi.fn().mockResolvedValue({
            ...createDerivedSlip10Node(),
            ...patch,
          }),
        } as unknown as SLIP10Node);

        await expect(
          service.deriveAddress({
            index: 0,
            entropySource: 'entropy-source-1',
          }),
        ).rejects.toThrow(new KeyDerivationException(expectedMessage));
      },
    );

    it('throws KeyDerivationException when ed25519 public key is not 32 bytes', async () => {
      const { service } = createWalletServiceTest({
        jsonNode: createJsonSlip10NodeFromWallet(createEd25519XrplWallet(0)),
      });
      vi.spyOn(SLIP10Node, 'fromJSON').mockResolvedValue({
        derive: vi.fn().mockResolvedValue({
          ...createDerivedSlip10Node(createEd25519XrplWallet(0)),
          publicKey: `0x${'11'.repeat(16)}`,
        }),
      } as unknown as SLIP10Node);

      await expect(
        service.deriveAddress({
          index: 0,
          entropySource: 'entropy-source-1',
          curve: XRPL_ED25519_CURVE,
        }),
      ).rejects.toThrow(
        new KeyDerivationException(
          'Derived public key must be a 32-byte ed25519 key',
        ),
      );
    });
  });

  describe('resolveWallet', () => {
    it('returns a wallet whose address and secret match the derived keypair', async () => {
      const bip44 = createBip44XrplWallet(0);
      const { service } = createWalletServiceTest();
      vi.spyOn(SLIP10Node, 'fromJSON').mockResolvedValue({
        derive: vi.fn().mockResolvedValue(createDerivedSlip10Node(bip44)),
      } as unknown as SLIP10Node);

      const wallet = await service.resolveWallet({
        index: 0,
        entropySource: 'entropy-source-1',
      });

      expect(wallet.address).toStrictEqual(bip44.classicAddress);
      expect(wallet.secret).toStrictEqual(bip44.privateKey);
    });

    it('returns an ed25519 wallet when curve is ed25519', async () => {
      const edWallet = createEd25519XrplWallet(1);
      const { service } = createWalletServiceTest({
        jsonNode: createJsonSlip10NodeFromWallet(edWallet),
      });
      vi.spyOn(SLIP10Node, 'fromJSON').mockResolvedValue({
        derive: vi.fn().mockResolvedValue(createDerivedSlip10Node(edWallet)),
      } as unknown as SLIP10Node);

      const wallet = await service.resolveWallet({
        index: 1,
        entropySource: 'entropy-source-1',
        curve: XRPL_ED25519_CURVE,
      });

      expect(wallet.address).toStrictEqual(edWallet.classicAddress);
      expect(wallet.secret).toStrictEqual(edWallet.privateKey);
    });

    it('throws KeyDerivationException when keypair derivation fails', async () => {
      const { service } = createWalletServiceTest({
        getBip32EntropyError: new Error('something went wrong'),
      });

      await expect(
        service.resolveWallet({
          index: 0,
          entropySource: 'entropy-source-1',
        }),
      ).rejects.toThrow(
        new KeyDerivationException('Unable to load coin-type derivation node'),
      );
    });
  });

  describe('getWalletResolver', () => {
    it('returns wallets matching BIP44 derivation for successive indices', async () => {
      const indices = [0, 1, 2];
      const wallets = indices.map((index) => createBip44XrplWallet(index));
      const deriveChild = vi.fn();
      for (const wallet of wallets) {
        deriveChild.mockResolvedValueOnce(createDerivedSlip10Node(wallet));
      }

      const { service, getBip32Entropy } = createWalletServiceTest();
      const fromJSON = vi.spyOn(SLIP10Node, 'fromJSON').mockResolvedValue({
        derive: deriveChild,
      } as unknown as SLIP10Node);

      const resolver = await service.getWalletResolver('entropy-source-1');

      const addresses = [];
      for (const index of indices) {
        const wallet = await resolver(index);
        addresses.push(wallet.address);
      }

      expect(addresses).toStrictEqual(
        wallets.map((wallet) => wallet.classicAddress),
      );
      expect(getBip32Entropy).toHaveBeenCalledWith({
        entropySource: 'entropy-source-1',
        path: getDerivationPath().split('/'),
        curve: XRPL_SECP_CURVE,
      });
      expect(fromJSON).toHaveBeenCalledTimes(1);
      expect(deriveChild.mock.calls).toStrictEqual([
        [['slip10:0']],
        [['slip10:1']],
        [['slip10:2']],
      ]);
    });

    it('derives hardened ed25519 child paths when curve is ed25519', async () => {
      const indices = [0, 1];
      const wallets = indices.map((index) => createEd25519XrplWallet(index));
      const deriveChild = vi.fn();
      for (const wallet of wallets) {
        deriveChild.mockResolvedValueOnce(createDerivedSlip10Node(wallet));
      }

      const { service, getBip32Entropy } = createWalletServiceTest({
        jsonNode: createJsonSlip10NodeFromWallet(wallets[0] as Wallet),
      });
      vi.spyOn(SLIP10Node, 'fromJSON').mockResolvedValue({
        derive: deriveChild,
      } as unknown as SLIP10Node);

      const resolver = await service.getWalletResolver(
        'entropy-source-1',
        XRPL_ED25519_CURVE,
      );

      const addresses = [];
      for (const index of indices) {
        const wallet = await resolver(index);
        addresses.push(wallet.address);
      }

      expect(addresses).toStrictEqual(
        wallets.map((wallet) => wallet.classicAddress),
      );
      expect(getBip32Entropy).toHaveBeenCalledWith({
        entropySource: 'entropy-source-1',
        path: getDerivationPath(undefined, XRPL_ED25519_CURVE).split('/'),
        curve: XRPL_ED25519_CURVE,
      });
      expect(deriveChild.mock.calls).toStrictEqual([
        [["slip10:0'"]],
        [["slip10:1'"]],
      ]);
    });

    it('loads the SLIP10 coin-type node once per resolver', async () => {
      const { service } = createWalletServiceTest();
      const fromJSON = vi.spyOn(SLIP10Node, 'fromJSON').mockResolvedValue({
        derive: vi
          .fn()
          .mockResolvedValue(createDerivedSlip10Node(createBip44XrplWallet(0))),
      } as unknown as SLIP10Node);

      const resolver = await service.getWalletResolver('entropy-source-1');
      await resolver(0);
      await resolver(0);

      expect(fromJSON).toHaveBeenCalledTimes(1);
    });

    it.each([
      {
        name: 'generic entropy failure',
        error: new Error('something went wrong'),
        expected: new KeyDerivationException(
          'Unable to load coin-type derivation node',
        ),
      },
      {
        name: 'XrplSnapException from getBip32Entropy',
        error: new XrplSnapException('Failed to get BIP32 entropy from Snap'),
        expected: new XrplSnapException(
          'Failed to get BIP32 entropy from Snap',
        ),
      },
    ])(
      'rethrows $name when loading the coin-type node',
      async ({ error, expected }) => {
        const { service } = createWalletServiceTest({
          getBip32EntropyError: error,
        });

        await expect(
          service.getWalletResolver('entropy-source-1'),
        ).rejects.toThrow(expected);
      },
    );

    it('throws KeyDerivationException when deriving keypair at account index fails', async () => {
      const { service } = createWalletServiceTest();
      vi.spyOn(SLIP10Node, 'fromJSON').mockResolvedValue({
        derive: vi.fn().mockRejectedValue(new Error('derive failed')),
      } as unknown as SLIP10Node);

      const resolver = await service.getWalletResolver('entropy-source-1');

      await expect(resolver(0)).rejects.toThrow(
        new KeyDerivationException('Unable to derive keypair at account index'),
      );
    });

    it('throws KeyDerivationException when derived node is missing key material', async () => {
      const { service } = createWalletServiceTest();
      vi.spyOn(SLIP10Node, 'fromJSON').mockResolvedValue({
        derive: vi.fn().mockResolvedValue({
          privateKey: undefined,
          publicKey: createJsonSlip10NodeFromWallet(createBip44XrplWallet(0))
            .publicKey,
        }),
      } as unknown as SLIP10Node);

      const resolver = await service.getWalletResolver('entropy-source-1');

      await expect(resolver(0)).rejects.toThrow(
        new KeyDerivationException('Derived node is missing key material'),
      );
    });
  });
});
