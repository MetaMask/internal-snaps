import {
  BIP44CoinTypeNode,
  BIP44PurposeNodeToken,
  mnemonicPhraseToBytes,
} from '@metamask/key-tree';
import type { JsonBIP44Node } from '@metamask/key-tree';
import type {
  CreateAccountOptions as KeyringBatchCreateAccountOptions,
  Transaction,
} from '@metamask/keyring-api';
import {
  AccountCreationType,
  KeyringEvent,
  TrxAccountType,
  TrxScope,
} from '@metamask/keyring-api';
import {
  emitSnapKeyringEvent,
  getSelectedAccounts,
} from '@metamask/keyring-snap-sdk';

import type { AccountsRepository } from './AccountsRepository';
import { AccountsService } from './AccountsService';
import type { SnapClient } from '../../clients/snap/SnapClient';
import { Network } from '../../constants';
import type { NativeAsset } from '../../entities/assets';
import type { TronKeyringAccount } from '../../entities/keyring-account';
import type { ILogger } from '../../utils/logger';
import { mockLogger } from '../../utils/mockLogger';
import type { AssetsService } from '../assets/AssetsService';
import type { ConfigProvider } from '../config';
import type { Config } from '../config/ConfigProvider';
import type { TransactionsService } from '../transactions/TransactionsService';

jest.mock('@metamask/keyring-snap-sdk', () => ({
  emitSnapKeyringEvent: jest.fn(),
  getSelectedAccounts: jest.fn().mockResolvedValue([]),
}));

const mockedEmitSnapKeyringEvent = emitSnapKeyringEvent as jest.MockedFunction<
  typeof emitSnapKeyringEvent
>;
const mockedGetSelectedAccounts = getSelectedAccounts as jest.MockedFunction<
  typeof getSelectedAccounts
>;

/**
 * Valid secp256k1 key pair (private key 1).
 * Public key uncompressed format; yields a deterministic address via computeAddress.
 */
const TEST_KEY_PAIR = {
  privateKey:
    '0x0000000000000000000000000000000000000000000000000000000000000001',
  publicKey:
    '0x0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8',
};

const EMPTY_NETWORK_URLS: Record<Network, string> = {
  [Network.Mainnet]: '',
  [Network.Nile]: '',
  [Network.Shasta]: '',
};

const MOCK_CONFIG: Config = {
  environment: 'test',
  networks: [],
  activeNetworks: [],
  priceApi: {
    baseUrl: '',
    chunkSize: 0,
    cacheTtlsMilliseconds: {
      fiatExchangeRates: 0,
      spotPrices: 0,
      historicalPrices: 0,
    },
  },
  tokenApi: { baseUrl: '', chunkSize: 0 },
  staticApi: { baseUrl: '' },
  transactions: { storageLimit: 0 },
  securityAlertsApi: { baseUrl: '' },
  nftApi: {
    baseUrl: '',
    cacheTtlsMilliseconds: { listAddressSolanaNfts: 0, getNftMetadata: 0 },
  },
  trongridApi: { baseUrls: EMPTY_NETWORK_URLS },
  tronHttpApi: { baseUrls: EMPTY_NETWORK_URLS },
};

/**
 * Returns a mock Tron coin type JSON for testing.
 *
 * @returns A mock Tron coin type JSON.
 */
async function getTronTestCoinTypeJson(): Promise<JsonBIP44Node> {
  const phrase =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const coinNode = await BIP44CoinTypeNode.fromDerivationPath([
    mnemonicPhraseToBytes(phrase),
    BIP44PurposeNodeToken,
    `bip32:195'`,
  ]);
  return coinNode.toJSON();
}

type WithAccountsServiceCallback = (payload: {
  accountsService: AccountsService;
  mockAccountsRepository: jest.Mocked<
    Pick<
      AccountsRepository,
      | 'getAll'
      | 'findById'
      | 'findByIds'
      | 'findByAddress'
      | 'findByEntropySourceAndRange'
      | 'create'
      | 'mergeKeyringAccounts'
      | 'delete'
    >
  >;
  mockConfigProvider: jest.Mocked<Pick<ConfigProvider, 'get'>>;
  mockLogger: ILogger;
  mockAssetsService: jest.Mocked<
    Pick<AssetsService, 'fetchAssetsAndBalancesForAccount' | 'saveMany'>
  >;
  mockSnapClient: jest.Mocked<
    Pick<SnapClient, 'getBip32Entropy' | 'listEntropySources'>
  >;
  mockTransactionsService: jest.Mocked<
    Pick<TransactionsService, 'fetchNewTransactionsForAccount' | 'saveMany'>
  >;
}) => void | Promise<void>;

/**
 * Creates a fresh AccountsService with all mock dependencies and passes them
 * to the test callback. Resets globals and mocks before each invocation.
 *
 * @param testFn - Callback that receives the service and mocks for testing.
 * @param tronCoinTypeBatchJson - When set, `getBip32Entropy` returns this for `m/44'/195'` (batch path).
 */
async function withAccountsService(
  testFn: WithAccountsServiceCallback,
  tronCoinTypeBatchJson?: JsonBIP44Node,
): Promise<void> {
  Object.defineProperty(globalThis, 'snap', {
    value: { request: jest.fn() },
    writable: true,
    configurable: true,
  });

  const keyringAccounts: TronKeyringAccount[] = [];

  const getAccountIndexKey = (account: TronKeyringAccount) =>
    `${account.entropySource}:${account.index}`;

  const mockAccountsRepository: jest.Mocked<
    Pick<
      AccountsRepository,
      | 'getAll'
      | 'findById'
      | 'findByIds'
      | 'findByAddress'
      | 'findByEntropySourceAndRange'
      | 'create'
      | 'mergeKeyringAccounts'
      | 'delete'
    >
  > = {
    getAll: jest.fn().mockImplementation(async () => [...keyringAccounts]),
    findById: jest.fn().mockImplementation(async (id: string) => {
      return keyringAccounts.find((account) => account.id === id) ?? null;
    }),
    findByIds: jest.fn().mockImplementation(async (ids: string[]) => {
      return keyringAccounts.filter((account) => ids.includes(account.id));
    }),
    findByAddress: jest.fn().mockImplementation(async (address: string) => {
      return (
        keyringAccounts.find((account) => account.address === address) ?? null
      );
    }),
    findByEntropySourceAndRange: jest
      .fn()
      .mockImplementation(
        async (entropySource: string, range: { from: number; to: number }) => {
          return keyringAccounts
            .filter(
              (account) =>
                account.entropySource === entropySource &&
                account.index >= range.from &&
                account.index <= range.to,
            )
            .sort((first, second) => first.index - second.index);
        },
      ),
    create: jest
      .fn()
      .mockImplementation(async (account: TronKeyringAccount) => {
        const conflicting = keyringAccounts.find(
          (existing) =>
            getAccountIndexKey(existing) === getAccountIndexKey(account),
        );

        if (conflicting) {
          return conflicting;
        }

        keyringAccounts.push(account);
        return account;
      }),
    mergeKeyringAccounts: jest
      .fn()
      .mockImplementation(
        async (newAccounts: Record<string, TronKeyringAccount>) => {
          const occupied = new Set(keyringAccounts.map(getAccountIndexKey));

          for (const account of Object.values(newAccounts)) {
            const indexKey = getAccountIndexKey(account);

            if (!occupied.has(indexKey)) {
              keyringAccounts.push(account);
              occupied.add(indexKey);
            }
          }
        },
      ),
    delete: jest.fn().mockImplementation(async (id: string) => {
      const index = keyringAccounts.findIndex((account) => account.id === id);

      if (index >= 0) {
        keyringAccounts.splice(index, 1);
      }
    }),
  };

  const mockConfigProvider: jest.Mocked<Pick<ConfigProvider, 'get'>> = {
    get: jest.fn().mockReturnValue(MOCK_CONFIG),
  };

  const mockSnapClient: jest.Mocked<
    Pick<SnapClient, 'getBip32Entropy' | 'listEntropySources'>
  > = {
    getBip32Entropy: jest
      .fn()
      .mockImplementation(
        async (params: {
          path: string[];
          curve: string;
          entropySource?: string;
        }) => {
          if (
            tronCoinTypeBatchJson &&
            params.curve === 'secp256k1' &&
            params.path.length === 3 &&
            params.path[0] === 'm' &&
            params.path[1] === "44'" &&
            params.path[2] === "195'"
          ) {
            return Promise.resolve(tronCoinTypeBatchJson);
          }
          return Promise.resolve(TEST_KEY_PAIR);
        },
      ),
    listEntropySources: jest
      .fn()
      .mockResolvedValue([{ id: 'test-entropy', primary: true }]),
  };

  const mockAssetsService: jest.Mocked<
    Pick<AssetsService, 'fetchAssetsAndBalancesForAccount' | 'saveMany'>
  > = {
    fetchAssetsAndBalancesForAccount: jest.fn().mockResolvedValue([]),
    saveMany: jest.fn().mockResolvedValue(undefined),
  };

  const mockTransactionsService: jest.Mocked<
    Pick<TransactionsService, 'fetchNewTransactionsForAccount' | 'saveMany'>
  > = {
    fetchNewTransactionsForAccount: jest.fn().mockResolvedValue([]),
    saveMany: jest.fn().mockResolvedValue(undefined),
  };

  const accountsService = new AccountsService({
    accountsRepository: mockAccountsRepository,
    configProvider: mockConfigProvider,
    logger: mockLogger,
    assetsService: mockAssetsService,
    snapClient: mockSnapClient,
    transactionsService: mockTransactionsService,
  } as unknown as ConstructorParameters<typeof AccountsService>[0]);

  await testFn({
    accountsService,
    mockAccountsRepository,
    mockConfigProvider,
    mockLogger,
    mockAssetsService,
    mockSnapClient,
    mockTransactionsService,
  });
}

describe('AccountsService', () => {
  describe('getDefaultDerivationPath', () => {
    it('returns path for index 0', () => {
      expect(AccountsService.getDefaultDerivationPath(0)).toBe(
        "m/44'/195'/0'/0/0",
      );
    });

    it('returns path for index 5', () => {
      expect(AccountsService.getDefaultDerivationPath(5)).toBe(
        "m/44'/195'/0'/0/5",
      );
    });
  });

  describe('deriveAccount', () => {
    it('returns TronKeyringAccount with correct structure for index 0', async () => {
      await withAccountsService(async ({ accountsService, mockSnapClient }) => {
        const result = await accountsService.deriveAccount({
          entropySource: 'test-entropy',
          index: 0,
        });

        expect(result).toMatchObject({
          entropySource: 'test-entropy',
          derivationPath: "m/44'/195'/0'/0/0",
          index: 0,
          type: TrxAccountType.Eoa,
          scopes: [TrxScope.Mainnet, TrxScope.Nile, TrxScope.Shasta],
          methods: ['signMessage', 'signTransaction'],
        });
        expect(result.id).toBeDefined();
        expect(typeof result.id).toBe('string');
        expect(result.address).toBeDefined();
        expect(result.address.length).toBeGreaterThan(0);
        expect(result.options.entropy).toMatchObject({
          type: 'mnemonic',
          id: 'test-entropy',
          derivationPath: "m/44'/195'/0'/0/0",
          groupIndex: 0,
        });

        expect(mockSnapClient.getBip32Entropy).toHaveBeenCalledWith({
          entropySource: 'test-entropy',
          path: ['m', "44'", "195'", "0'", '0', '0'],
          curve: 'secp256k1',
        });
      });
    });

    it('returns correct derivation path for index 5', async () => {
      await withAccountsService(async ({ accountsService, mockSnapClient }) => {
        const result = await accountsService.deriveAccount({
          entropySource: 'test-entropy',
          index: 5,
        });

        expect(result.derivationPath).toBe("m/44'/195'/0'/0/5");
        expect(mockSnapClient.getBip32Entropy).toHaveBeenCalledWith(
          expect.objectContaining({
            path: ['m', "44'", "195'", "0'", '0', '5'],
          }),
        );
      });
    });
  });

  describe('createAccounts', () => {
    it('persists new accounts with a single merge and one coin-type entropy call', async () => {
      const coinJson = await getTronTestCoinTypeJson();

      await withAccountsService(
        async ({ accountsService, mockAccountsRepository, mockSnapClient }) => {
          const result = await accountsService.createAccounts({
            type: AccountCreationType.Bip44DeriveIndexRange,
            entropySource: 'test-entropy',
            range: { from: 0, to: 1 },
          });

          expect(result).toHaveLength(2);
          expect(result[0]?.options).toMatchObject({
            exportable: true,
            entropy: expect.objectContaining({ groupIndex: 0 }),
          });
          expect(result[1]?.options).toMatchObject({
            exportable: true,
            entropy: expect.objectContaining({ groupIndex: 1 }),
          });

          expect(mockSnapClient.getBip32Entropy).toHaveBeenCalledWith({
            entropySource: 'test-entropy',
            path: ['m', "44'", "195'"],
            curve: 'secp256k1',
          });
          expect(
            mockAccountsRepository.findByEntropySourceAndRange,
          ).toHaveBeenCalledWith('test-entropy', { from: 0, to: 1 });
          expect(
            mockAccountsRepository.findByEntropySourceAndRange,
          ).toHaveBeenCalledTimes(2);
          expect(mockAccountsRepository.getAll).not.toHaveBeenCalled();

          expect(
            mockAccountsRepository.mergeKeyringAccounts,
          ).toHaveBeenCalledTimes(1);
          const merged = mockAccountsRepository.mergeKeyringAccounts.mock
            .calls[0]?.[0] as Record<string, TronKeyringAccount>;
          expect(Object.keys(merged)).toHaveLength(2);
        },
        coinJson,
      );
    });

    it('creates more than 100 accounts with a single merge and entropy call', async () => {
      const coinJson = await getTronTestCoinTypeJson();

      await withAccountsService(
        async ({ accountsService, mockAccountsRepository, mockSnapClient }) => {
          const result = await accountsService.createAccounts({
            type: AccountCreationType.Bip44DeriveIndexRange,
            entropySource: 'test-entropy',
            range: { from: 0, to: 100 },
          });

          expect(result).toHaveLength(101);
          expect(result[0]?.options).toMatchObject({
            entropy: expect.objectContaining({ groupIndex: 0 }),
          });
          expect(result[100]?.options).toMatchObject({
            entropy: expect.objectContaining({ groupIndex: 100 }),
          });

          expect(mockSnapClient.getBip32Entropy).toHaveBeenCalledTimes(1);
          expect(
            mockAccountsRepository.mergeKeyringAccounts,
          ).toHaveBeenCalledTimes(1);

          const mergedAccounts = mockAccountsRepository.mergeKeyringAccounts
            .mock.calls[0]?.[0] as Record<string, TronKeyringAccount>;

          expect(Object.keys(mergedAccounts)).toHaveLength(101);
          expect(
            Object.values(mergedAccounts).some(
              (account) => account.index === 100,
            ),
          ).toBe(true);
        },
        coinJson,
      );
    });

    it('returns persisted accounts when merge skips indices taken concurrently', async () => {
      const coinJson = await getTronTestCoinTypeJson();
      const concurrentAccount: TronKeyringAccount = {
        id: 'concurrent-0',
        entropySource: 'test-entropy',
        derivationPath: "m/44'/195'/0'/0/0",
        index: 0,
        type: TrxAccountType.Eoa,
        address: 'TConcurrent0',
        scopes: [TrxScope.Mainnet, TrxScope.Nile, TrxScope.Shasta],
        options: {},
        methods: ['signMessage', 'signTransaction'],
      };

      await withAccountsService(
        async ({ accountsService, mockAccountsRepository }) => {
          mockAccountsRepository.findByEntropySourceAndRange
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([concurrentAccount]);

          const result = await accountsService.createAccounts({
            type: AccountCreationType.Bip44DeriveIndex,
            entropySource: 'test-entropy',
            groupIndex: 0,
          });

          expect(result).toHaveLength(1);
          expect(result[0]?.id).toBe('concurrent-0');
        },
        coinJson,
      );
    });

    it('does not merge when accounts already exist for the range', async () => {
      const coinJson = await getTronTestCoinTypeJson();
      const existing0: TronKeyringAccount = {
        id: 'existing-0',
        entropySource: 'test-entropy',
        derivationPath: "m/44'/195'/0'/0/0",
        index: 0,
        type: TrxAccountType.Eoa,
        address: 'TExisting0',
        scopes: [TrxScope.Mainnet, TrxScope.Nile, TrxScope.Shasta],
        options: {},
        methods: ['signMessage', 'signTransaction'],
      };
      const existing1: TronKeyringAccount = {
        id: 'existing-1',
        entropySource: 'test-entropy',
        derivationPath: "m/44'/195'/0'/0/1",
        index: 1,
        type: TrxAccountType.Eoa,
        address: 'TExisting1',
        scopes: [TrxScope.Mainnet, TrxScope.Nile, TrxScope.Shasta],
        options: {},
        methods: ['signMessage', 'signTransaction'],
      };

      await withAccountsService(
        async ({ accountsService, mockAccountsRepository, mockSnapClient }) => {
          mockAccountsRepository.findByEntropySourceAndRange.mockResolvedValue([
            existing0,
            existing1,
          ]);

          const result = await accountsService.createAccounts({
            type: AccountCreationType.Bip44DeriveIndexRange,
            entropySource: 'test-entropy',
            range: { from: 0, to: 1 },
          });

          expect(result).toHaveLength(2);
          expect(result[0]?.id).toBe('existing-0');
          expect(result[1]?.id).toBe('existing-1');
          expect(
            mockAccountsRepository.mergeKeyringAccounts,
          ).not.toHaveBeenCalled();
          expect(mockSnapClient.getBip32Entropy).not.toHaveBeenCalled();
        },
        coinJson,
      );
    });

    it('throws before storage or entropy access when the range is invalid', async () => {
      await withAccountsService(
        async ({ accountsService, mockAccountsRepository, mockSnapClient }) => {
          const invalidOptions: KeyringBatchCreateAccountOptions[] = [
            {
              type: AccountCreationType.Bip44DeriveIndex,
              entropySource: 'test-entropy',
              groupIndex: -1,
            },
            {
              type: AccountCreationType.Bip44DeriveIndex,
              entropySource: 'test-entropy',
              groupIndex: 1.5,
            },
            {
              type: AccountCreationType.Bip44DeriveIndexRange,
              entropySource: 'test-entropy',
              range: { from: 2, to: 1 },
            },
            {
              type: AccountCreationType.Bip44DeriveIndex,
              entropySource: 'test-entropy',
              groupIndex: 0x80000000,
            },
          ];

          for (const options of invalidOptions) {
            await expect(
              accountsService.createAccounts(options),
            ).rejects.toThrow('Invalid account creation range');
          }

          expect(mockAccountsRepository.getAll).not.toHaveBeenCalled();
          expect(
            mockAccountsRepository.findByEntropySourceAndRange,
          ).not.toHaveBeenCalled();
          expect(mockSnapClient.getBip32Entropy).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('create', () => {
    it('creates and persists a new account', async () => {
      mockedEmitSnapKeyringEvent.mockResolvedValue();

      await withAccountsService(
        async ({ accountsService, mockAccountsRepository }) => {
          jest.spyOn(accountsService, 'deriveAccount').mockResolvedValue({
            id: 'test-uuid-123',
            entropySource: 'test-entropy',
            derivationPath: "m/44'/195'/0'/0/0",
            index: 0,
            type: TrxAccountType.Eoa,
            address: 'TTestAddress1234567890123456789',
            scopes: [TrxScope.Mainnet, TrxScope.Nile, TrxScope.Shasta],
            options: {
              entropy: {
                type: 'mnemonic',
                id: 'test-entropy',
                derivationPath: "m/44'/195'/0'/0/0",
                groupIndex: 0,
              },
              exportable: true,
            },
            methods: ['signMessage', 'signTransaction'],
          });

          const result = await accountsService.create({
            entropySource: 'test-entropy',
            index: 0,
          });

          expect(result.id).toBe('test-uuid-123');
          expect(mockAccountsRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'test-uuid-123' }),
          );
          expect(mockedEmitSnapKeyringEvent).toHaveBeenCalledWith(
            expect.anything(),
            KeyringEvent.AccountCreated,
            expect.objectContaining({
              account: expect.objectContaining({ id: 'test-uuid-123' }),
            }),
          );
        },
      );
    });

    it('uses default entropy source and lowest unused index when options are omitted', async () => {
      mockedEmitSnapKeyringEvent.mockResolvedValue();

      const existingAccount: TronKeyringAccount = {
        id: 'existing-default-0',
        entropySource: 'test-entropy',
        derivationPath: "m/44'/195'/0'/0/0",
        index: 0,
        type: TrxAccountType.Eoa,
        address: 'TExistingDefault0',
        scopes: [TrxScope.Mainnet, TrxScope.Nile, TrxScope.Shasta],
        options: {},
        methods: ['signMessage', 'signTransaction'],
      };

      await withAccountsService(
        async ({ accountsService, mockAccountsRepository, mockSnapClient }) => {
          mockAccountsRepository.getAll.mockResolvedValue([existingAccount]);
          const deriveAccount = jest
            .spyOn(accountsService, 'deriveAccount')
            .mockResolvedValue({
              id: 'default-create-id',
              entropySource: 'test-entropy',
              derivationPath: "m/44'/195'/0'/0/1",
              index: 1,
              type: TrxAccountType.Eoa,
              address: 'TDefaultCreate1',
              scopes: [TrxScope.Mainnet, TrxScope.Nile, TrxScope.Shasta],
              options: {
                entropy: {
                  type: 'mnemonic',
                  id: 'test-entropy',
                  derivationPath: "m/44'/195'/0'/0/1",
                  groupIndex: 1,
                },
                exportable: true,
              },
              methods: ['signMessage', 'signTransaction'],
            });

          const result = await accountsService.create();

          expect(result.id).toBe('default-create-id');
          expect(mockSnapClient.listEntropySources).toHaveBeenCalledTimes(1);
          expect(deriveAccount).toHaveBeenCalledWith({
            entropySource: 'test-entropy',
            index: 1,
          });
          expect(mockAccountsRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'default-create-id', index: 1 }),
          );
        },
      );
    });

    it('returns existing account when same derivation path exists', async () => {
      const existingAccount: TronKeyringAccount = {
        id: 'existing-id',
        entropySource: 'test-entropy',
        derivationPath: "m/44'/195'/0'/0/0",
        index: 0,
        type: TrxAccountType.Eoa,
        address: 'TExisting123456789012345678901',
        scopes: [TrxScope.Mainnet, TrxScope.Nile, TrxScope.Shasta],
        options: {},
        methods: ['signMessage', 'signTransaction'],
      };

      await withAccountsService(
        async ({ accountsService, mockAccountsRepository }) => {
          mockAccountsRepository.getAll.mockResolvedValue([existingAccount]);

          const result = await accountsService.create({
            entropySource: 'test-entropy',
            index: 0,
          });

          expect(result.id).toBe('existing-id');
          expect(mockAccountsRepository.create).not.toHaveBeenCalled();
          expect(mockLogger.warn).toHaveBeenCalled();
        },
      );
    });

    it('rolls back persisted account when event emission fails', async () => {
      mockedEmitSnapKeyringEvent.mockRejectedValue(
        new Error('Event emission failed'),
      );

      await withAccountsService(
        async ({ accountsService, mockAccountsRepository }) => {
          jest.spyOn(accountsService, 'deriveAccount').mockResolvedValue({
            id: 'rollback-test-id',
            entropySource: 'test-entropy',
            derivationPath: "m/44'/195'/0'/0/0",
            index: 0,
            type: TrxAccountType.Eoa,
            address: 'TRollback12345678901234567890',
            scopes: [TrxScope.Mainnet, TrxScope.Nile, TrxScope.Shasta],
            options: {
              entropy: {
                type: 'mnemonic',
                id: 'test-entropy',
                derivationPath: "m/44'/195'/0'/0/0",
                groupIndex: 0,
              },
              exportable: true,
            },
            methods: ['signMessage', 'signTransaction'],
          });

          await expect(
            accountsService.create({
              entropySource: 'test-entropy',
              index: 0,
            }),
          ).rejects.toThrow('Event emission failed');

          expect(mockAccountsRepository.create).toHaveBeenCalled();
          expect(mockAccountsRepository.delete).toHaveBeenCalledWith(
            'rollback-test-id',
          );
        },
      );
    });

    it('preserves the original error when rollback delete also fails', async () => {
      mockedEmitSnapKeyringEvent.mockRejectedValue(
        new Error('Event emission failed'),
      );

      await withAccountsService(
        async ({ accountsService, mockAccountsRepository }) => {
          mockAccountsRepository.delete.mockRejectedValue(
            new Error('Delete failed'),
          );
          jest.spyOn(accountsService, 'deriveAccount').mockResolvedValue({
            id: 'rollback-fail-id',
            entropySource: 'test-entropy',
            derivationPath: "m/44'/195'/0'/0/0",
            index: 0,
            type: TrxAccountType.Eoa,
            address: 'TRollback12345678901234567890',
            scopes: [TrxScope.Mainnet, TrxScope.Nile, TrxScope.Shasta],
            options: {
              entropy: {
                type: 'mnemonic',
                id: 'test-entropy',
                derivationPath: "m/44'/195'/0'/0/0",
                groupIndex: 0,
              },
              exportable: true,
            },
            methods: ['signMessage', 'signTransaction'],
          });

          await expect(
            accountsService.create({
              entropySource: 'test-entropy',
              index: 0,
            }),
          ).rejects.toThrow('Event emission failed');

          expect(mockAccountsRepository.delete).toHaveBeenCalledWith(
            'rollback-fail-id',
          );
          expect(mockLogger.error).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ accountId: 'rollback-fail-id' }),
            'Failed to rollback account creation',
          );
        },
      );
    });

    it('passes metamask options through to emit', async () => {
      mockedEmitSnapKeyringEvent.mockResolvedValue();

      await withAccountsService(async ({ accountsService }) => {
        jest.spyOn(accountsService, 'deriveAccount').mockResolvedValue({
          id: 'meta-id',
          entropySource: 'test-entropy',
          derivationPath: "m/44'/195'/0'/0/0",
          index: 0,
          type: TrxAccountType.Eoa,
          address: 'TMeta1234567890123456789012',
          scopes: [TrxScope.Mainnet, TrxScope.Nile, TrxScope.Shasta],
          options: {},
          methods: ['signMessage', 'signTransaction'],
        });

        await accountsService.create({
          entropySource: 'test-entropy',
          index: 0,
          metamask: { correlationId: 'corr-123' },
        });

        expect(mockedEmitSnapKeyringEvent).toHaveBeenCalledWith(
          expect.anything(),
          KeyringEvent.AccountCreated,
          expect.objectContaining({
            metamask: { correlationId: 'corr-123' },
          }),
        );
      });
    });
  });

  describe('getAll', () => {
    it('delegates to repository and returns result', async () => {
      const accounts: TronKeyringAccount[] = [
        {
          id: 'a1',
          address: 'TAddr1',
          type: TrxAccountType.Eoa,
          options: {},
          methods: [],
          scopes: [],
          entropySource: 'e1',
          derivationPath: "m/44'/195'/0'/0/0",
          index: 0,
        },
      ];

      await withAccountsService(
        async ({ accountsService, mockAccountsRepository }) => {
          mockAccountsRepository.getAll.mockResolvedValue(accounts);

          const result = await accountsService.getAll();

          expect(result).toStrictEqual(accounts);
          expect(mockAccountsRepository.getAll).toHaveBeenCalled();
        },
      );
    });
  });

  describe('getAllSelected', () => {
    it('returns only accounts whose IDs are in getSelectedAccounts', async () => {
      const account1: TronKeyringAccount = {
        id: 'selected-1',
        address: 'TAddr1',
        type: TrxAccountType.Eoa,
        options: {},
        methods: [],
        scopes: [],
        entropySource: 'e1',
        derivationPath: "m/44'/195'/0'/0/0",
        index: 0,
      };
      const account2: TronKeyringAccount = {
        id: 'not-selected',
        address: 'TAddr2',
        type: TrxAccountType.Eoa,
        options: {},
        methods: [],
        scopes: [],
        entropySource: 'e1',
        derivationPath: "m/44'/195'/0'/0/1",
        index: 1,
      };

      await withAccountsService(
        async ({ accountsService, mockAccountsRepository }) => {
          mockAccountsRepository.getAll.mockResolvedValue([account1, account2]);
          mockedGetSelectedAccounts.mockResolvedValue(['selected-1']);

          const result = await accountsService.getAllSelected();

          expect(result).toHaveLength(1);
          expect(result[0]?.id).toBe('selected-1');
        },
      );
    });

    it('returns empty when no accounts selected', async () => {
      await withAccountsService(
        async ({ accountsService, mockAccountsRepository }) => {
          mockAccountsRepository.getAll.mockResolvedValue([]);
          mockedGetSelectedAccounts.mockResolvedValue([]);

          const result = await accountsService.getAllSelected();

          expect(result).toStrictEqual([]);
        },
      );
    });
  });

  describe('findById', () => {
    it('delegates to repository', async () => {
      const account: TronKeyringAccount = {
        id: 'find-id',
        address: 'TFind',
        type: TrxAccountType.Eoa,
        options: {},
        methods: [],
        scopes: [],
        entropySource: 'e1',
        derivationPath: "m/44'/195'/0'/0/0",
        index: 0,
      };

      await withAccountsService(
        async ({ accountsService, mockAccountsRepository }) => {
          mockAccountsRepository.findById.mockResolvedValue(account);

          const result = await accountsService.findById('find-id');

          expect(result).toStrictEqual(account);
          expect(mockAccountsRepository.findById).toHaveBeenCalledWith(
            'find-id',
          );
        },
      );
    });
  });

  describe('findByIdOrThrow', () => {
    it('returns account when found', async () => {
      const account: TronKeyringAccount = {
        id: 'throw-found',
        address: 'TFound',
        type: TrxAccountType.Eoa,
        options: {},
        methods: [],
        scopes: [],
        entropySource: 'e1',
        derivationPath: "m/44'/195'/0'/0/0",
        index: 0,
      };

      await withAccountsService(
        async ({ accountsService, mockAccountsRepository }) => {
          mockAccountsRepository.findById.mockResolvedValue(account);

          const result = await accountsService.findByIdOrThrow('throw-found');

          expect(result).toStrictEqual(account);
        },
      );
    });

    it('throws when account not found', async () => {
      await withAccountsService(
        async ({ accountsService, mockAccountsRepository }) => {
          mockAccountsRepository.findById.mockResolvedValue(null);

          await expect(
            accountsService.findByIdOrThrow('missing-id'),
          ).rejects.toThrow('Account with ID missing-id not found');
        },
      );
    });
  });

  describe('findByIds', () => {
    it('returns accounts from repository', async () => {
      const accounts: TronKeyringAccount[] = [
        {
          id: 'id1',
          address: 'T1',
          type: TrxAccountType.Eoa,
          options: {},
          methods: [],
          scopes: [],
          entropySource: 'e1',
          derivationPath: "m/44'/195'/0'/0/0",
          index: 0,
        },
      ];

      await withAccountsService(
        async ({ accountsService, mockAccountsRepository }) => {
          mockAccountsRepository.findByIds.mockResolvedValue(accounts);

          const result = await accountsService.findByIds(['id1']);

          expect(result).toStrictEqual(accounts);
          expect(mockAccountsRepository.findByIds).toHaveBeenCalledWith([
            'id1',
          ]);
        },
      );
    });

    it('logs error when some accounts not found', async () => {
      await withAccountsService(
        async ({ accountsService, mockAccountsRepository }) => {
          mockAccountsRepository.findByIds.mockResolvedValue([]);

          await accountsService.findByIds(['missing-1', 'missing-2']);

          expect(mockLogger.error).toHaveBeenCalledWith(
            '[🔑 AccountsService]',
            '[findByIds] Some accounts not found',
          );
        },
      );
    });
  });

  describe('findByAddress', () => {
    it('delegates to repository', async () => {
      const account: TronKeyringAccount = {
        id: 'addr-id',
        address: 'TByAddress123456789012345678',
        type: TrxAccountType.Eoa,
        options: {},
        methods: [],
        scopes: [],
        entropySource: 'e1',
        derivationPath: "m/44'/195'/0'/0/0",
        index: 0,
      };

      await withAccountsService(
        async ({ accountsService, mockAccountsRepository }) => {
          mockAccountsRepository.findByAddress.mockResolvedValue(account);

          const result = await accountsService.findByAddress(
            'TByAddress123456789012345678',
          );

          expect(result).toStrictEqual(account);
          expect(mockAccountsRepository.findByAddress).toHaveBeenCalledWith(
            'TByAddress123456789012345678',
          );
        },
      );
    });
  });

  describe('delete', () => {
    it('delegates to repository', async () => {
      await withAccountsService(
        async ({ accountsService, mockAccountsRepository }) => {
          await accountsService.delete('delete-id');

          expect(mockAccountsRepository.delete).toHaveBeenCalledWith(
            'delete-id',
          );
        },
      );
    });
  });

  describe('synchronizeAssets', () => {
    it('calls fetch for each account and scope, then saveMany', async () => {
      const account: TronKeyringAccount = {
        id: 'sync-asset-id',
        address: 'TSyncAsset12345678901234567',
        type: TrxAccountType.Eoa,
        options: {},
        methods: [],
        scopes: [],
        entropySource: 'e1',
        derivationPath: "m/44'/195'/0'/0/0",
        index: 0,
      };
      const mockAssets: NativeAsset[] = [
        {
          assetType: `${Network.Mainnet}/slip44:195`,
          keyringAccountId: 'sync-asset-id',
          network: Network.Mainnet,
          symbol: 'TRX',
          decimals: 6,
          rawAmount: '1000000',
          uiAmount: '1',
          iconUrl: '',
        },
      ];

      await withAccountsService(
        async ({ accountsService, mockConfigProvider, mockAssetsService }) => {
          mockConfigProvider.get.mockReturnValue({
            ...MOCK_CONFIG,
            activeNetworks: [Network.Mainnet, Network.Shasta],
          });
          mockAssetsService.fetchAssetsAndBalancesForAccount.mockResolvedValue(
            mockAssets,
          );

          await accountsService.synchronizeAssets([account]);

          expect(
            mockAssetsService.fetchAssetsAndBalancesForAccount,
          ).toHaveBeenCalledTimes(2);
          expect(
            mockAssetsService.fetchAssetsAndBalancesForAccount,
          ).toHaveBeenCalledWith(Network.Mainnet, account);
          expect(
            mockAssetsService.fetchAssetsAndBalancesForAccount,
          ).toHaveBeenCalledWith(Network.Shasta, account);
          expect(mockAssetsService.saveMany).toHaveBeenCalledWith(
            expect.arrayContaining(mockAssets),
          );
        },
      );
    });

    it('handles empty activeNetworks', async () => {
      await withAccountsService(
        async ({ accountsService, mockConfigProvider, mockAssetsService }) => {
          mockConfigProvider.get.mockReturnValue(MOCK_CONFIG);

          const account: TronKeyringAccount = {
            id: 'empty-id',
            address: 'TEmpty12345678901234567890',
            type: TrxAccountType.Eoa,
            options: {},
            methods: [],
            scopes: [],
            entropySource: 'e1',
            derivationPath: "m/44'/195'/0'/0/0",
            index: 0,
          };

          await accountsService.synchronizeAssets([account]);

          expect(
            mockAssetsService.fetchAssetsAndBalancesForAccount,
          ).not.toHaveBeenCalled();
          expect(mockAssetsService.saveMany).toHaveBeenCalledWith([]);
        },
      );
    });
  });

  describe('synchronizeTransactions', () => {
    it('calls fetch for each account and scope, then saveMany', async () => {
      const account: TronKeyringAccount = {
        id: 'sync-tx-id',
        address: 'TSyncTx123456789012345678',
        type: TrxAccountType.Eoa,
        options: {},
        methods: [],
        scopes: [],
        entropySource: 'e1',
        derivationPath: "m/44'/195'/0'/0/0",
        index: 0,
      };
      const mockTransactions: Transaction[] = [
        {
          id: 'tx-1',
          type: 'send',
          account: 'sync-tx-id',
          chain: Network.Mainnet,
          status: 'confirmed',
          timestamp: 12345,
          from: [],
          to: [],
          fees: [],
          events: [],
        },
      ];

      await withAccountsService(
        async ({
          accountsService,
          mockConfigProvider,
          mockTransactionsService,
        }) => {
          mockConfigProvider.get.mockReturnValue({
            ...MOCK_CONFIG,
            activeNetworks: [Network.Mainnet],
          });
          mockTransactionsService.fetchNewTransactionsForAccount.mockResolvedValue(
            mockTransactions,
          );

          await accountsService.synchronizeTransactions([account]);

          expect(
            mockTransactionsService.fetchNewTransactionsForAccount,
          ).toHaveBeenCalledWith(Network.Mainnet, account);
          expect(mockTransactionsService.saveMany).toHaveBeenCalledWith(
            mockTransactions,
          );
        },
      );
    });
  });

  describe('synchronize', () => {
    it('calls both synchronizeAssets and synchronizeTransactions', async () => {
      const account: TronKeyringAccount = {
        id: 'sync-id',
        address: 'TSync12345678901234567890',
        type: TrxAccountType.Eoa,
        options: {},
        methods: [],
        scopes: [],
        entropySource: 'e1',
        derivationPath: "m/44'/195'/0'/0/0",
        index: 0,
      };

      await withAccountsService(
        async ({
          accountsService,
          mockConfigProvider,
          mockAssetsService,
          mockTransactionsService,
        }) => {
          mockConfigProvider.get.mockReturnValue({
            ...MOCK_CONFIG,
            activeNetworks: [Network.Mainnet],
          });

          await accountsService.synchronize([account]);

          expect(
            mockAssetsService.fetchAssetsAndBalancesForAccount,
          ).toHaveBeenCalledWith(Network.Mainnet, account);
          expect(
            mockTransactionsService.fetchNewTransactionsForAccount,
          ).toHaveBeenCalledWith(Network.Mainnet, account);
        },
      );
    });
  });
});
