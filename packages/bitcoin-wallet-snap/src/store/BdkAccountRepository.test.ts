// TODO: enable when this is merged: https://github.com/rustwasm/wasm-bindgen/issues/1818
/* eslint-disable camelcase */

import type { DescriptorPair } from '@metamask/bitcoindevkit';
import {
  Address,
  ChangeSet,
  slip10_to_extended,
  xpriv_to_descriptor,
  xpub_to_descriptor,
} from '@metamask/bitcoindevkit';
import type { BIP32Node, BIP39Node, SLIP10Node } from '@metamask/key-tree';
import {
  mnemonicPhraseToBytes,
  SLIP10Node as RealSlip10Node,
} from '@metamask/key-tree';
import type {
  IStateManager,
  Serializable,
} from '@metamask/snap-networks-utils';
import { State } from '@metamask/snap-networks-utils';
import type { Json } from '@metamask/snaps-sdk';
import { mock } from 'jest-mock-extended';

import type {
  AccountState,
  BitcoinAccount,
  Inscription,
  SnapClient,
  SnapState,
} from '../entities';
import { BdkAccountAdapter } from '../infra';
import { BdkAccountRepository } from './BdkAccountRepository';

// TODO: enable when this is merged: https://github.com/rustwasm/wasm-bindgen/issues/1818

jest.mock('@metamask/bitcoindevkit', () => {
  return {
    ChangeSet: {
      from_json: jest.fn(),
    },
    Address: {
      from_string: jest.fn(),
    },
    slip10_to_extended: jest.fn().mockReturnValue('mock-extended'),
    xpub_to_descriptor: jest.fn(),
    xpriv_to_descriptor: jest.fn(),
  };
});

jest.mock('../infra/BdkAccountAdapter', () => ({
  BdkAccountAdapter: {
    load: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

type StateRequest = {
  method: 'snap_getState' | 'snap_setState';
  params: { key: string; value?: Json; encrypted: boolean };
};

/**
 * Uses real State locks with separate persisted stores and asynchronous reads.
 *
 * @param snapClient - Client used for entropy requests.
 * @param encrypted - Persisted encrypted state.
 * @param unencrypted - Persisted unencrypted state.
 * @returns The repository, stores, and unencrypted State instance.
 */
function setupStateRepository(
  snapClient: SnapClient,
  encrypted: Partial<SnapState>,
  unencrypted: Partial<SnapState>,
): {
  repository: BdkAccountRepository;
  encrypted: Partial<SnapState>;
  unencrypted: Partial<SnapState>;
  unencryptedState: State<Partial<SnapState>>;
} {
  const request = jest.fn(async ({ method, params }: StateRequest) => {
    const storage = params.encrypted ? encrypted : unencrypted;
    if (method === 'snap_getState') {
      const value = params.key
        .split('.')
        .reduce<unknown>(
          (current, key) =>
            (current as Record<string, unknown> | undefined)?.[key],
          storage,
        );
      const snapshot =
        value === undefined ? null : JSON.parse(JSON.stringify(value));
      await Promise.resolve();
      return snapshot;
    }
    const path = params.key.split('.');
    let target: Record<string, unknown> = storage;
    for (const key of path.slice(0, -1)) {
      target[key] ??= {};
      target = target[key] as Record<string, unknown>;
    }
    target[path[path.length - 1] as string] = params.value;
    return null;
  });
  Object.defineProperty(globalThis, 'snap', {
    configurable: true,
    value: { request },
    writable: true,
  });

  const encryptedState = new State<Partial<SnapState>>({
    encrypted: true,
    defaultState: { accounts: {} },
  });
  const unencryptedState = new State<Partial<SnapState>>({
    encrypted: false,
    defaultState: { derivationPaths: {} },
  });
  return {
    repository: new BdkAccountRepository(
      snapClient,
      encryptedState,
      unencryptedState,
    ),
    encrypted,
    unencrypted,
    unencryptedState,
  };
}

describe('BdkAccountRepository', () => {
  const mockSnapClient = mock<SnapClient>();
  const mockState = mock<IStateManager<Partial<SnapState>>>();
  const mockWalletData = '{"mywallet":"data"}';
  const mockDerivationPath = ['m', "84'", "0'", "0'"];
  const mockSlip10Node = {
    masterFingerprint: 0xdeadbeef,
  } as unknown as SLIP10Node;
  const mockDescriptors = mock<DescriptorPair>({
    external: 'ext-desc',
    internal: 'int-desc',
  });
  const mockAccountState = mock<AccountState>({
    wallet: mockWalletData,
    derivationPath: mockDerivationPath,
  });
  const mockChangeSet = mock<ChangeSet>();
  const mockAddress = mock<Address>({
    toString: () => 'bc1qaddress...',
  });
  const mockAccount = mock<BitcoinAccount>({
    id: 'some-id',
    derivationPath: mockDerivationPath,
    network: 'bitcoin',
    addressType: 'p2wpkh',
    publicAddress: mockAddress,
    publicDescriptor: 'mock-public-descriptor',
  });

  const repo = new BdkAccountRepository(mockSnapClient, mockState, mockState);

  beforeEach(() => {
    jest
      .mocked(mockState.setKeyWith)
      .mockImplementation(
        async <TValue extends Serializable>(
          key: string,
          updater: (value: TValue | undefined) => TValue,
        ) => {
          await mockState.setKey(
            key,
            updater(await mockState.getKey<TValue>(key)),
          );
        },
      );
    (BdkAccountAdapter.load as jest.Mock).mockReturnValue(mockAccount);
    (BdkAccountAdapter.create as jest.Mock).mockReturnValue(mockAccount);
    (ChangeSet.from_json as jest.Mock).mockReturnValue(mockChangeSet);
    mockSnapClient.getPrivateEntropy.mockResolvedValue(mockSlip10Node);
    mockSnapClient.getPublicEntropy.mockResolvedValue(mockSlip10Node);
    (xpriv_to_descriptor as jest.Mock).mockReturnValue(mockDescriptors);
    (xpub_to_descriptor as jest.Mock).mockReturnValue(mockDescriptors);
    jest.mocked(Address.from_string).mockReturnValue(mockAddress);
    (mockAccount.takeStaged as jest.Mock) = jest
      .fn()
      .mockReturnValue(mockChangeSet);
    (mockAccount.hasStaged as jest.Mock) = jest.fn().mockReturnValue(true);
    (mockChangeSet.to_json as jest.Mock) = jest
      .fn()
      .mockReturnValue(mockWalletData);
  });

  describe('get', () => {
    it('returns null if account not found', async () => {
      mockState.getKey.mockResolvedValue(null);

      const result = await repo.get('non-existent-id');

      expect(result).toBeNull();
    });

    it('returns loaded account if found', async () => {
      mockState.getKey.mockResolvedValue(mockAccountState);

      const result = await repo.get('some-id');

      expect(mockState.getKey).toHaveBeenCalledWith('accounts.some-id');
      expect(ChangeSet.from_json).toHaveBeenCalledWith(mockWalletData);
      expect(BdkAccountAdapter.load).toHaveBeenCalledWith(
        mockAccount.id,
        mockDerivationPath,
        mockChangeSet,
      );
      expect(result).toBe(mockAccount);
    });
  });

  describe('getAll', () => {
    it('returns empty array if no accounts found', async () => {
      mockState.getKey.mockResolvedValue(null);

      const result = await repo.getAll();

      expect(result).toStrictEqual([]);
    });

    it('returns all accounts', async () => {
      const id1 = 'some-id-1';
      const id2 = 'some-id-2';
      const state = {
        [id1]: { ...mockAccountState, id: id1 },
        [id2]: { ...mockAccountState, id: id2 },
      };
      const mockAccount1 = { ...mockAccount, id: id1 };
      const mockAccount2 = { ...mockAccount, id: id2 };

      mockState.getKey.mockResolvedValue(state);
      (BdkAccountAdapter.load as jest.Mock)
        .mockReturnValueOnce(mockAccount1)
        .mockReturnValueOnce(mockAccount2);

      const result = await repo.getAll();

      expect(mockState.getKey).toHaveBeenCalledWith('accounts');
      expect(BdkAccountAdapter.load).toHaveBeenCalledTimes(2);
      expect(result).toStrictEqual([mockAccount1, mockAccount2]);
    });

    it('filters out null accounts', async () => {
      const id1 = 'some-id-1';
      const id2 = 'some-id-2';
      const id3 = 'deleted-id';
      const state = {
        [id1]: { ...mockAccountState, id: id1 },
        [id2]: { ...mockAccountState, id: id2 },
        [id3]: null, // Deleted account
      };
      const mockAccount1 = { ...mockAccount, id: id1 };
      const mockAccount2 = { ...mockAccount, id: id2 };

      mockState.getKey.mockResolvedValue(state);
      (BdkAccountAdapter.load as jest.Mock)
        .mockReturnValueOnce(mockAccount1)
        .mockReturnValueOnce(mockAccount2);

      const result = await repo.getAll();

      expect(mockState.getKey).toHaveBeenCalledWith('accounts');
      expect(BdkAccountAdapter.load).toHaveBeenCalledTimes(2);
      expect(result).toStrictEqual([mockAccount1, mockAccount2]);
    });
  });

  describe('getByIds', () => {
    it('returns empty array if no account IDs are provided', async () => {
      const result = await repo.getByIds([]);

      expect(mockState.getKey).not.toHaveBeenCalled();
      expect(result).toStrictEqual([]);
    });

    it('returns requested accounts in requested order', async () => {
      const id1 = 'some-id-1';
      const id2 = 'some-id-2';
      const state = {
        [id1]: { ...mockAccountState, id: id1 },
        [id2]: { ...mockAccountState, id: id2 },
      };
      const mockAccount1 = { ...mockAccount, id: id1 };
      const mockAccount2 = { ...mockAccount, id: id2 };

      mockState.getKey.mockResolvedValue(state);
      (BdkAccountAdapter.load as jest.Mock)
        .mockReturnValueOnce(mockAccount2)
        .mockReturnValueOnce(mockAccount1);

      const result = await repo.getByIds([id2, 'missing-id', id1]);

      expect(mockState.getKey).toHaveBeenCalledWith('accounts');
      expect(BdkAccountAdapter.load).toHaveBeenCalledTimes(2);
      expect(result).toStrictEqual([mockAccount2, mockAccount1]);
    });

    it('matches account IDs case-insensitively', async () => {
      const id = '724ac464-6572-4d9c-a8e2-4075c8846d65';
      const state = {
        [id]: { ...mockAccountState, id },
      };
      const loadedAccount = { ...mockAccount, id };

      mockState.getKey.mockResolvedValue(state);
      (BdkAccountAdapter.load as jest.Mock).mockReturnValueOnce(loadedAccount);

      const result = await repo.getByIds([id.toUpperCase()]);

      expect(mockState.getKey).toHaveBeenCalledWith('accounts');
      expect(BdkAccountAdapter.load).toHaveBeenCalledTimes(1);
      expect(result).toStrictEqual([loadedAccount]);
    });

    it('uses cached account metadata without loading BDK wallets', async () => {
      const id1 = 'some-id-1';
      const id2 = 'some-id-2';
      const accountState1: AccountState = {
        ...mockAccountState,
        metadata: {
          address: 'bc1qcached1...',
          addressType: 'p2wpkh',
          network: 'bitcoin',
          publicDescriptor: 'cached-public-descriptor-1',
        },
      };
      const accountState2: AccountState = {
        ...mockAccountState,
        metadata: {
          address: 'bc1qcached2...',
          addressType: 'p2wpkh',
          network: 'bitcoin',
          publicDescriptor: 'cached-public-descriptor-2',
        },
      };
      mockState.getKey.mockResolvedValue({
        [id1]: accountState1,
        [id2]: accountState2,
      });
      (BdkAccountAdapter.load as jest.Mock).mockClear();
      (ChangeSet.from_json as jest.Mock).mockClear();

      const result = await repo.getByIds([id2, 'missing-id', id1]);

      expect(mockState.getKey).toHaveBeenCalledWith('accounts');
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe(id2);
      expect(result[0]?.publicAddress.toString()).toBe('bc1qaddress...');
      expect(result[0]?.publicDescriptor).toBe('cached-public-descriptor-2');
      expect(result[1]?.id).toBe(id1);
      expect(result[1]?.publicAddress.toString()).toBe('bc1qaddress...');
      expect(result[1]?.publicDescriptor).toBe('cached-public-descriptor-1');
      expect(jest.mocked(Address.from_string)).toHaveBeenCalledWith(
        'bc1qcached2...',
        'bitcoin',
      );
      expect(jest.mocked(Address.from_string)).toHaveBeenCalledWith(
        'bc1qcached1...',
        'bitcoin',
      );
      expect(ChangeSet.from_json).not.toHaveBeenCalled();
      expect(BdkAccountAdapter.load).not.toHaveBeenCalled();
    });

    it('returns empty array if no accounts are found', async () => {
      mockState.getKey.mockResolvedValue(null);

      const result = await repo.getByIds(['some-id']);

      expect(mockState.getKey).toHaveBeenCalledWith('accounts');
      expect(result).toStrictEqual([]);
    });
  });

  describe('getByDerivationPath', () => {
    it('returns null if account not found', async () => {
      mockState.getKey.mockResolvedValue(null);

      const result = await repo.getByDerivationPath(mockDerivationPath);

      expect(result).toBeNull();
    });

    it('returns account if derivation path exists', async () => {
      mockState.getKey
        .mockResolvedValueOnce('some-id')
        .mockResolvedValueOnce(mockAccountState);

      const result = await repo.getByDerivationPath(mockDerivationPath);

      expect(mockState.getKey).toHaveBeenCalledWith(
        "derivationPaths.m/84'/0'/0'",
      );
      expect(mockState.getKey).toHaveBeenCalledWith('accounts.some-id');
      expect(result).toBe(mockAccount);
    });
  });

  describe('getByDerivationPaths', () => {
    const derivationPath1 = ['m', "84'", "0'", "1'"];
    const derivationPath2 = ['m', "84'", "0'", "2'"];
    const accountState1 = {
      ...mockAccountState,
      derivationPath: derivationPath1,
    };
    const accountState2 = {
      ...mockAccountState,
      derivationPath: derivationPath2,
    };
    const mockAccount1 = mock<BitcoinAccount>({
      ...mockAccount,
      id: 'some-id-1',
      derivationPath: derivationPath1,
    });
    const mockAccount2 = mock<BitcoinAccount>({
      ...mockAccount,
      id: 'some-id-2',
      derivationPath: derivationPath2,
    });

    it('returns accounts in derivation path order with one state read per namespace', async () => {
      mockState.getKey
        .mockResolvedValueOnce({
          "m/84'/0'/1'": 'some-id-1',
          "m/84'/0'/2'": 'some-id-2',
        })
        .mockResolvedValueOnce({
          'some-id-1': accountState1,
          'some-id-2': accountState2,
        });
      (BdkAccountAdapter.load as jest.Mock)
        .mockReturnValueOnce(mockAccount2)
        .mockReturnValueOnce(mockAccount1);

      const result = await repo.getByDerivationPaths([
        derivationPath2,
        derivationPath1,
      ]);

      expect(mockState.getKey).toHaveBeenCalledWith('derivationPaths');
      expect(mockState.getKey).toHaveBeenCalledWith('accounts');
      expect(mockState.getKey).toHaveBeenCalledTimes(2);
      expect(result).toStrictEqual([mockAccount2, mockAccount1]);
      expect(mockState.setKey).not.toHaveBeenCalled();
    });

    it('uses cached account metadata without loading BDK wallets', async () => {
      const accountStateWithMetadata: AccountState = {
        ...accountState1,
        metadata: {
          address: 'bc1qcached...',
          addressType: 'p2wpkh',
          network: 'bitcoin',
          publicDescriptor: 'cached-public-descriptor',
        },
      };
      mockState.getKey
        .mockResolvedValueOnce({
          "m/84'/0'/1'": 'some-id-1',
        })
        .mockResolvedValueOnce({
          'some-id-1': accountStateWithMetadata,
        });
      (BdkAccountAdapter.load as jest.Mock).mockClear();
      (ChangeSet.from_json as jest.Mock).mockClear();

      const result = await repo.getByDerivationPaths([derivationPath1]);
      const account = result[0];

      expect(account?.id).toBe('some-id-1');
      expect(account?.publicAddress.toString()).toBe('bc1qaddress...');
      expect(account?.publicDescriptor).toBe('cached-public-descriptor');
      expect(jest.mocked(Address.from_string)).toHaveBeenCalledWith(
        'bc1qcached...',
        'bitcoin',
      );
      expect(ChangeSet.from_json).not.toHaveBeenCalled();
      expect(BdkAccountAdapter.load).not.toHaveBeenCalled();
    });

    it('repairs missing derivation path indexes from account state', async () => {
      mockState.getKey
        .mockResolvedValueOnce({
          "m/84'/0'/1'": 'some-id-1',
        })
        .mockResolvedValueOnce({
          'some-id-1': accountState1,
          'some-id-2': accountState2,
        })
        .mockResolvedValueOnce({
          "m/84'/0'/1'": 'some-id-1',
        });
      (BdkAccountAdapter.load as jest.Mock)
        .mockReturnValueOnce(mockAccount1)
        .mockReturnValueOnce(mockAccount2);

      const result = await repo.getByDerivationPaths([
        derivationPath1,
        derivationPath2,
      ]);

      expect(result).toStrictEqual([mockAccount1, mockAccount2]);
      expect(mockState.setKey).toHaveBeenCalledWith('derivationPaths', {
        "m/84'/0'/1'": 'some-id-1',
        "m/84'/0'/2'": 'some-id-2',
      });
    });

    it('repairs a missing derivation path index for a single lookup', async () => {
      mockState.getKey.mockResolvedValueOnce({}).mockResolvedValueOnce({
        'some-id-1': accountState1,
      });
      (BdkAccountAdapter.load as jest.Mock).mockReturnValueOnce(mockAccount1);

      const result = await repo.getByDerivationPaths([derivationPath1]);

      expect(result).toStrictEqual([mockAccount1]);
      expect(mockState.setKey).toHaveBeenCalledWith('derivationPaths', {
        "m/84'/0'/1'": 'some-id-1',
      });
    });
  });

  describe('getWithSigner', () => {
    it('returns null if account not found', async () => {
      mockState.getKey.mockResolvedValue(null);

      const result = await repo.getWithSigner('some-id');

      expect(result).toBeNull();
    });

    it('returns account with signer if account exists', async () => {
      mockState.getKey.mockResolvedValue(mockAccountState);

      const result = await repo.getWithSigner('some-id');

      expect(mockSnapClient.getPrivateEntropy).toHaveBeenCalledWith(
        mockDerivationPath,
      );
      expect(BdkAccountAdapter.load).toHaveBeenCalledTimes(2);
      expect(BdkAccountAdapter.load).toHaveBeenLastCalledWith(
        'some-id',
        mockDerivationPath,
        mockChangeSet,
        mockDescriptors,
      );
      expect(result).toBe(mockAccount);
    });
  });

  describe('create', () => {
    it('creates a new account with xpub', async () => {
      const result = await repo.create(mockDerivationPath, 'bitcoin', 'p2wpkh');

      expect(BdkAccountAdapter.create).toHaveBeenCalledWith(
        'mock-uuid',
        mockDerivationPath,
        mockDescriptors,
        'bitcoin',
      );
      expect(result).toBe(mockAccount);
    });
  });

  describe('createMany', () => {
    const mnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const parentPath = ['entropy-1', "84'", "0'"];
    const requests = [
      {
        derivationPath: ['entropy-1', "84'", "0'", "0'"],
        network: 'bitcoin',
        addressType: 'p2wpkh',
      },
      {
        derivationPath: ['entropy-1', "84'", "0'", "1'"],
        network: 'bitcoin',
        addressType: 'p2wpkh',
      },
    ] as Parameters<BdkAccountRepository['createMany']>[0];

    /**
     * Derives the real SLIP-10 node for a path from the fixture mnemonic.
     *
     * @param segments - Hardened path segments below the master node.
     * @returns The derived node.
     */
    async function deriveFixtureNode(
      segments: string[],
    ): Promise<RealSlip10Node> {
      const derivationPath: [BIP39Node, ...BIP32Node[]] = [
        mnemonicPhraseToBytes(mnemonic) as BIP39Node,
        ...segments.map((segment) => `bip32:${segment}` as BIP32Node),
      ];

      return RealSlip10Node.fromDerivationPath({
        derivationPath,
        curve: 'secp256k1',
      });
    }

    beforeEach(async () => {
      const parentNode = await deriveFixtureNode(["84'", "0'"]);
      mockSnapClient.getPrivateEntropy.mockResolvedValue(parentNode.toJSON());
    });

    it('fetches entropy once per distinct parent path', async () => {
      const result = await repo.createMany(requests);

      expect(mockSnapClient.getPrivateEntropy).toHaveBeenCalledTimes(1);
      expect(mockSnapClient.getPrivateEntropy).toHaveBeenCalledWith(parentPath);
      expect(mockSnapClient.getPublicEntropy).not.toHaveBeenCalled();
      expect(BdkAccountAdapter.create).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it('derives neutered children byte-identical to full-path derivation', async () => {
      await repo.createMany([requests[1]] as typeof requests);

      // Independent route: full-path derivation from the same mnemonic, the
      // way `snap_getBip32Entropy` would resolve it.
      const expected = (await deriveFixtureNode(["84'", "0'", "1'"])).neuter();

      const passedNode = (slip10_to_extended as jest.Mock).mock
        .calls[0]?.[0] as RealSlip10Node;
      expect(passedNode.privateKey).toBeUndefined();
      expect(passedNode.publicKey).toStrictEqual(expected.publicKey);
      expect(passedNode.chainCode).toStrictEqual(expected.chainCode);
      expect(passedNode.masterFingerprint).toBe(expected.masterFingerprint);
    });

    it('returns an empty array without entropy fetches for empty input', async () => {
      const result = await repo.createMany([]);

      expect(result).toStrictEqual([]);
      expect(mockSnapClient.getPrivateEntropy).not.toHaveBeenCalled();
    });
  });

  describe('insert', () => {
    it('throws an error if no wallet data', async () => {
      await expect(
        repo.insert({
          ...mockAccount,
          takeStaged: jest.fn().mockReturnValue(undefined),
        }),
      ).rejects.toThrow(
        'Missing changeset data for account "some-id" for insertion.',
      );
    });

    it('inserts an account', async () => {
      await repo.insert(mockAccount);

      expect(mockState.setKey).toHaveBeenNthCalledWith(
        1,
        "derivationPaths.m/84'/0'/0'",
        mockAccount.id,
      );
      expect(mockState.setKey).toHaveBeenLastCalledWith('accounts.some-id', {
        wallet: mockWalletData,
        inscriptions: [],
        derivationPath: mockDerivationPath,
        metadata: {
          address: 'bc1qaddress...',
          addressType: 'p2wpkh',
          network: 'bitcoin',
          publicDescriptor: 'mock-public-descriptor',
        },
      });
    });
  });

  describe('insertMany', () => {
    it('returns an empty array when there are no accounts to insert', async () => {
      const result = await repo.insertMany([]);

      expect(result).toStrictEqual([]);
      expect(mockState.getKey).not.toHaveBeenCalled();
      expect(mockState.setKey).not.toHaveBeenCalled();
    });

    it('throws an error if any account has no wallet data', async () => {
      await expect(
        repo.insertMany([
          {
            ...mockAccount,
            id: 'missing-wallet',
            takeStaged: jest.fn().mockReturnValue(undefined),
          },
          mockAccount,
        ]),
      ).rejects.toThrow(
        'Missing changeset data for account "missing-wallet" for insertion.',
      );
      expect(mockState.setKey).not.toHaveBeenCalled();
    });

    it('throws an error without consuming staged data if any account has no wallet data', async () => {
      const accountWithWalletData = mock<BitcoinAccount>({
        id: 'some-id-1',
        derivationPath: ['m', "84'", "0'", "1'"],
      });
      (accountWithWalletData.hasStaged as jest.Mock) = jest
        .fn()
        .mockReturnValue(true);
      (accountWithWalletData.takeStaged as jest.Mock) = jest
        .fn()
        .mockReturnValue(mockChangeSet);
      const missingWalletAccount = mock<BitcoinAccount>({
        id: 'missing-wallet',
        derivationPath: ['m', "84'", "0'", "2'"],
      });
      (missingWalletAccount.hasStaged as jest.Mock) = jest
        .fn()
        .mockReturnValue(false);
      (missingWalletAccount.takeStaged as jest.Mock) = jest.fn();

      await expect(
        repo.insertMany([accountWithWalletData, missingWalletAccount]),
      ).rejects.toThrow(
        'Missing changeset data for account "missing-wallet" for insertion.',
      );

      expect(accountWithWalletData.hasStaged).toHaveBeenCalled();
      expect(missingWalletAccount.hasStaged).toHaveBeenCalled();
      expect(accountWithWalletData.takeStaged).not.toHaveBeenCalled();
      expect(missingWalletAccount.takeStaged).not.toHaveBeenCalled();
      expect(mockState.getKey).not.toHaveBeenCalled();
      expect(mockState.setKey).not.toHaveBeenCalled();
    });

    it('inserts multiple accounts with one accounts write and one derivation path write', async () => {
      const existingAccountState: AccountState = {
        wallet: mockWalletData,
        inscriptions: [],
        derivationPath: mockDerivationPath,
      };
      const account1 = mock<BitcoinAccount>();
      account1.id = 'some-id-1';
      account1.derivationPath = ['m', "84'", "0'", "1'"];
      account1.network = 'bitcoin';
      account1.addressType = 'p2wpkh';
      account1.publicAddress = mockAddress;
      account1.publicDescriptor = 'mock-public-descriptor-1';
      const account2 = mock<BitcoinAccount>();
      account2.id = 'some-id-2';
      account2.derivationPath = ['m', "84'", "0'", "2'"];
      account2.network = 'bitcoin';
      account2.addressType = 'p2wpkh';
      account2.publicAddress = mockAddress;
      account2.publicDescriptor = 'mock-public-descriptor-2';
      (account1.takeStaged as jest.Mock) = jest
        .fn()
        .mockReturnValue(mockChangeSet);
      (account1.hasStaged as jest.Mock) = jest.fn().mockReturnValue(true);
      (account2.takeStaged as jest.Mock) = jest
        .fn()
        .mockReturnValue(mockChangeSet);
      (account2.hasStaged as jest.Mock) = jest.fn().mockReturnValue(true);
      mockState.getKey
        .mockResolvedValueOnce({
          'existing-id': existingAccountState,
        })
        .mockResolvedValueOnce({
          "m/84'/0'/0'": 'existing-id',
        });

      const result = await repo.insertMany([account1, account2]);

      expect(result).toStrictEqual([account1, account2]);
      expect(mockState.setKey).toHaveBeenNthCalledWith(1, 'accounts', {
        'existing-id': existingAccountState,
        'some-id-1': {
          wallet: mockWalletData,
          inscriptions: [],
          derivationPath: ['m', "84'", "0'", "1'"],
          metadata: {
            address: 'bc1qaddress...',
            addressType: 'p2wpkh',
            network: 'bitcoin',
            publicDescriptor: 'mock-public-descriptor-1',
          },
        },
        'some-id-2': {
          wallet: mockWalletData,
          inscriptions: [],
          derivationPath: ['m', "84'", "0'", "2'"],
          metadata: {
            address: 'bc1qaddress...',
            addressType: 'p2wpkh',
            network: 'bitcoin',
            publicDescriptor: 'mock-public-descriptor-2',
          },
        },
      });
      expect(mockState.setKey).toHaveBeenNthCalledWith(2, 'derivationPaths', {
        "m/84'/0'/0'": 'existing-id',
        "m/84'/0'/1'": 'some-id-1',
        "m/84'/0'/2'": 'some-id-2',
      });
    });

    it('merges the latest account and derivation-path maps', async () => {
      const staleExistingAccountState: AccountState = {
        wallet: mockWalletData,
        inscriptions: [],
        derivationPath: mockDerivationPath,
      };
      const freshExistingAccountState: AccountState = {
        ...staleExistingAccountState,
        wallet: 'fresh-wallet-data',
      };
      const makeInsertableAccount = (
        id: string,
        derivationPath: string[],
      ): BitcoinAccount => {
        const account = mock<BitcoinAccount>();
        account.id = id;
        account.derivationPath = derivationPath;
        account.network = 'bitcoin';
        account.addressType = 'p2wpkh';
        account.publicAddress = mockAddress;
        account.publicDescriptor = 'mock-public-descriptor';
        (account.takeStaged as jest.Mock) = jest
          .fn()
          .mockReturnValue(mockChangeSet);
        (account.hasStaged as jest.Mock) = jest.fn().mockReturnValue(true);
        return account;
      };
      const account1 = makeInsertableAccount('some-id-1', [
        'm',
        "84'",
        "0'",
        "1'",
      ]);
      const account2 = makeInsertableAccount('some-id-2', [
        'm',
        "84'",
        "0'",
        "2'",
      ]);
      mockState.getKey
        .mockResolvedValueOnce({ 'existing-id': freshExistingAccountState })
        .mockResolvedValueOnce({
          "m/84'/0'/0'": 'existing-id',
          concurrent: 'other-id',
        });

      await repo.insertMany([account1, account2]);

      expect(mockState.getKey).toHaveBeenCalledTimes(2);
      expect(mockState.getKey).toHaveBeenCalledWith('accounts');
      expect(mockState.getKey).toHaveBeenCalledWith('derivationPaths');
      expect(mockState.setKey).toHaveBeenCalledWith(
        'accounts',
        expect.objectContaining({
          'existing-id': freshExistingAccountState,
          'some-id-1': expect.anything(),
          'some-id-2': expect.anything(),
        }),
      );
      expect(mockState.setKey).toHaveBeenCalledWith('derivationPaths', {
        concurrent: 'other-id',
        "m/84'/0'/0'": 'existing-id',
        "m/84'/0'/1'": 'some-id-1',
        "m/84'/0'/2'": 'some-id-2',
      });
    });
  });

  describe('update', () => {
    it('does nothing if no wallet data', async () => {
      await repo.update({
        ...mockAccount,
        takeStaged: jest.fn().mockReturnValue(undefined),
      });

      expect(mockState.setKey).not.toHaveBeenCalled();
    });

    it('throws an error if account not found', async () => {
      mockState.getKey.mockResolvedValue(null);

      await expect(repo.update(mockAccount)).rejects.toThrow(
        'Inconsistent state: account "some-id" not found for update',
      );
    });

    it('updates the account and inscriptions', async () => {
      const mockInscription = mock<Inscription>();

      mockState.getKey.mockResolvedValue(mockWalletData);

      await repo.update(mockAccount, [mockInscription]);

      expect(mockChangeSet.merge).toHaveBeenCalled();
      expect(mockState.getKey).toHaveBeenCalledWith('accounts.some-id.wallet');
      expect(mockState.setKey).toHaveBeenNthCalledWith(
        1,
        'accounts.some-id.wallet',
        mockWalletData,
      );
      expect(mockState.setKey).toHaveBeenLastCalledWith(
        'accounts.some-id.inscriptions',
        [mockInscription],
      );
    });
  });

  describe('delete', () => {
    it('does nothing if account not found', async () => {
      mockState.getKey.mockResolvedValue(null);

      await repo.delete('non-existent-id');

      expect(mockState.setKey).not.toHaveBeenCalled();
    });

    it('removes wallet data from store', async () => {
      const accountState: AccountState = {
        ...mockAccountState,
        derivationPath: ['m', "84'", "0'", "0'"],
      };

      mockState.getKey.mockResolvedValue(accountState);

      await repo.delete('some-id-1');

      expect(mockState.getKey).toHaveBeenCalledWith('accounts.some-id-1');
      expect(mockState.setKey).toHaveBeenCalledTimes(2);
      expect(mockState.setKey).toHaveBeenCalledWith(
        "derivationPaths.m/84'/0'/0'",
        null,
      );
      expect(mockState.setKey).toHaveBeenCalledWith('accounts.some-id-1', null);
    });
  });

  describe('concurrent state operations', () => {
    const makeAccount = (
      id: string,
      index: number,
      changes: ChangeSet = mockChangeSet,
    ): BitcoinAccount => ({
      ...mockAccount,
      id,
      derivationPath: ['m', "84'", "0'", `${index}'`],
      hasStaged: () => true,
      takeStaged: () => changes,
    });

    const makeChanges = (values: string[]): ChangeSet => {
      let current = [...values];
      const changes = mock<ChangeSet>();
      changes.to_json.mockImplementation(() => JSON.stringify(current));
      changes.merge.mockImplementation((other) => {
        current = [...current, ...(JSON.parse(other.to_json()) as string[])];
      });
      return changes;
    };

    it('preserves both batches during overlapping inserts and keeps the stores separate', async () => {
      const { repository, encrypted, unencrypted } = setupStateRepository(
        mockSnapClient,
        {},
        { rescanV1: { pending: ['existing-id'] } },
      );
      const accounts = [1, 2, 3, 4].map((index) =>
        makeAccount(`account-${index}`, index),
      );

      await Promise.all([
        repository.insertMany(accounts.slice(0, 2)),
        repository.insertMany(accounts.slice(2)),
      ]);

      expect(Object.keys(encrypted.accounts ?? {})).toStrictEqual([
        'account-1',
        'account-2',
        'account-3',
        'account-4',
      ]);
      expect(unencrypted).toStrictEqual({
        rescanV1: { pending: ['existing-id'] },
        derivationPaths: {
          "m/84'/0'/1'": 'account-1',
          "m/84'/0'/2'": 'account-2',
          "m/84'/0'/3'": 'account-3',
          "m/84'/0'/4'": 'account-4',
        },
      });
      expect(encrypted).not.toHaveProperty('derivationPaths');
      expect(encrypted.accounts?.['account-1']?.wallet).toBe(mockWalletData);
    });

    it('merges overlapping wallet updates without losing either changeset', async () => {
      const { repository, encrypted } = setupStateRepository(
        mockSnapClient,
        {
          accounts: {
            'existing-id': {
              wallet: '["base"]',
              inscriptions: [],
              derivationPath: mockDerivationPath,
            },
          },
        },
        {},
      );
      jest
        .mocked(ChangeSet.from_json)
        .mockImplementation((wallet) =>
          makeChanges(JSON.parse(wallet) as string[]),
        );

      await Promise.all([
        repository.update(
          makeAccount('existing-id', 0, makeChanges(['first'])),
        ),
        repository.update(
          makeAccount('existing-id', 0, makeChanges(['second'])),
        ),
      ]);

      expect(
        JSON.parse(encrypted.accounts?.['existing-id']?.wallet ?? 'null'),
      ).toStrictEqual(['second', 'first', 'base']);
    });

    it('preserves a concurrent wallet update while inserting a batch', async () => {
      const { repository, encrypted } = setupStateRepository(
        mockSnapClient,
        {
          accounts: {
            'existing-id': {
              wallet: '["base"]',
              inscriptions: [],
              derivationPath: mockDerivationPath,
            },
          },
        },
        {},
      );
      jest
        .mocked(ChangeSet.from_json)
        .mockImplementation((wallet) =>
          makeChanges(JSON.parse(wallet) as string[]),
        );

      await Promise.all([
        repository.update(makeAccount('existing-id', 0, makeChanges(['new']))),
        repository.insertMany([
          makeAccount('first', 1),
          makeAccount('second', 2),
        ]),
      ]);

      expect(
        JSON.parse(encrypted.accounts?.['existing-id']?.wallet ?? 'null'),
      ).toStrictEqual(['new', 'base']);
      expect(encrypted.accounts).toHaveProperty('first');
      expect(encrypted.accounts).toHaveProperty('second');
    });

    it('preserves a concurrent index write when repairing a missing derivation path', async () => {
      const { repository, unencryptedState, unencrypted } =
        setupStateRepository(
          mockSnapClient,
          {
            accounts: {
              'existing-id': {
                wallet: mockWalletData,
                inscriptions: [],
                derivationPath: mockDerivationPath,
              },
            },
          },
          { derivationPaths: {} },
        );

      const lookup = repository.getByDerivationPaths([mockDerivationPath]);
      await unencryptedState.setKey('derivationPaths.concurrent', 'other-id');
      await lookup;

      expect(unencrypted.derivationPaths).toStrictEqual({
        concurrent: 'other-id',
        "m/84'/0'/0'": 'existing-id',
      });
    });
  });

  describe('fetchInscriptions', () => {
    it('returns null if inscriptions are not found', async () => {
      mockState.getKey.mockResolvedValue(null);

      const result = await repo.fetchInscriptions('non-existent-id');

      expect(mockState.getKey).toHaveBeenCalledWith(
        'accounts.non-existent-id.inscriptions',
      );
      expect(result).toBeNull();
    });

    it('returns inscriptions when found', async () => {
      const mockInscriptions: Inscription[] = [
        {
          id: 'ins1',
          number: 1,
          contentLength: 100,
          contentType: 'image/png',
          satNumber: 1000,
          satRarity: 'common',
          location: 'txid1:vout:offset',
        },
        {
          id: 'ins2',
          number: 2,
          contentLength: 200,
          contentType: 'text/plain',
          satNumber: 2000,
          satRarity: 'uncommon',
          location: 'txid2:vout:offset',
        },
      ];

      mockState.getKey.mockResolvedValue(mockInscriptions);

      const result = await repo.fetchInscriptions('some-id');

      expect(mockState.getKey).toHaveBeenCalledWith(
        'accounts.some-id.inscriptions',
      );
      expect(result).toStrictEqual(mockInscriptions);
    });
  });

  describe('getFrozenUTXOs', () => {
    it('returns empty array if inscriptions is not found', async () => {
      mockState.getKey.mockResolvedValue(null);

      const result = await repo.getFrozenUTXOs('non-existent-id');
      expect(result).toStrictEqual([]);
    });

    it('returns empty array if inscriptions is empty', async () => {
      mockState.getKey.mockResolvedValue([]);

      const result = await repo.getFrozenUTXOs('some-id');
      expect(result).toStrictEqual([]);
    });

    it('returns the list of frozen UTXO outpoints', async () => {
      const mockInscriptions = [
        { location: 'txid1:vout:offset' },
        { location: 'txid2:vout:offset' },
      ] as Inscription[];

      mockState.getKey.mockResolvedValue(mockInscriptions);

      const result = await repo.getFrozenUTXOs('some-id');

      expect(mockState.getKey).toHaveBeenCalledWith(
        'accounts.some-id.inscriptions',
      );
      expect(result).toStrictEqual(['txid1:vout', 'txid2:vout']);
    });
  });
});
