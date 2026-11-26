import type { JsonSLIP10Node } from '@metamask/key-tree';
import { SLIP10Node } from '@metamask/key-tree';
import * as SnapUtils from '@metamask/snap-networks-utils';
import type { MockInstance } from 'vitest';

import { XRPL_SECP_CURVE } from '../../constants';
import { XrplSnapException } from '../../utils/errors';
import {
  createBip44XrplWallet,
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

function createDerivedSlip10Node(wallet = createBip44XrplWallet(0)) {
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
    it('derives the BIP44 classic address and requests entropy for the index path', async () => {
      const expected = createBip44XrplWallet(0);
      const { service, getBip32Entropy } = createWalletServiceTest({
        jsonNode: createJsonSlip10NodeFromWallet(expected),
      });

      const address = await service.deriveAddress({
        index: 0,
        entropySource: 'entropy-source-1',
      });

      expect(address).toStrictEqual(expected.classicAddress);
      expect(getBip32Entropy).toHaveBeenCalledWith({
        entropySource: 'entropy-source-1',
        path: getDerivationPath(0).split('/'),
        curve: XRPL_SECP_CURVE,
      });
    });

    it.each([
      {
        name: 'generic entropy failure',
        error: new Error('something went wrong'),
        expected: new KeyDerivationException(
          'Unable to derive keypair from entropy',
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
        const base = createJsonSlip10NodeFromWallet(createBip44XrplWallet(0));
        const { service } = createWalletServiceTest({
          jsonNode: { ...base, ...patch } as JsonSLIP10Node,
        });

        await expect(
          service.deriveAddress({
            index: 0,
            entropySource: 'entropy-source-1',
          }),
        ).rejects.toThrow(new KeyDerivationException(expectedMessage));
      },
    );
  });

  describe('resolveWallet', () => {
    it('returns a wallet whose address and secret match the derived keypair', async () => {
      const bip44 = createBip44XrplWallet(0);
      const { service } = createWalletServiceTest({
        jsonNode: createJsonSlip10NodeFromWallet(bip44),
      });

      const wallet = await service.resolveWallet({
        index: 0,
        entropySource: 'entropy-source-1',
      });

      expect(wallet.address).toStrictEqual(bip44.classicAddress);
      expect(wallet.secret).toStrictEqual(bip44.privateKey);
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
        new KeyDerivationException('Unable to derive keypair from entropy'),
      );
    });
  });

  describe('getWalletResolver', () => {
    it('returns wallets matching BIP44 derivation for successive indices', async () => {
      const indices = [0, 1, 2];
      const wallets = indices.map((index) => createBip44XrplWallet(index));
      const derive = vi.fn();
      for (const wallet of wallets) {
        derive.mockResolvedValueOnce(createDerivedSlip10Node(wallet));
      }

      const { service, getBip32Entropy } = createWalletServiceTest();
      const fromJSON = vi.spyOn(SLIP10Node, 'fromJSON').mockResolvedValue({
        derive,
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
      expect(derive.mock.calls).toStrictEqual([
        [['slip10:0']],
        [['slip10:1']],
        [['slip10:2']],
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
