import type { Transaction } from '@metamask/keyring-api';
import { KeyringEvent, TrxAccountType, TrxScope } from '@metamask/keyring-api';
import {
  emitSnapKeyringEvent,
  getSelectedAccounts,
} from '@metamask/keyring-snap-sdk';

import type { AccountsRepository } from './AccountsRepository';
import { AccountsService } from './AccountsService';
import type { SnapClient } from '../../clients/snap/SnapClient';
import { Network } from '../../constants';
import type { TronKeyringAccount } from '../../entities';
import type { NativeAsset } from '../../entities/assets';
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

type WithAccountsServiceCallback = (payload: {
  accountsService: AccountsService;
  mockAccountsRepository: jest.Mocked<
    Pick<
      AccountsRepository,
      | 'getAll'
      | 'findById'
      | 'findByIds'
      | 'findByAddress'
      | 'create'
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
 */
async function withAccountsService(
  testFn: WithAccountsServiceCallback,
): Promise<void> {
  Object.defineProperty(globalThis, 'snap', {
    value: { request: jest.fn() },
    writable: true,
    configurable: true,
  });

  const mockAccountsRepository: jest.Mocked<
    Pick<
      AccountsRepository,
      | 'getAll'
      | 'findById'
      | 'findByIds'
      | 'findByAddress'
      | 'create'
      | 'delete'
    >
  > = {
    getAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    findByIds: jest.fn().mockResolvedValue([]),
    findByAddress: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigProvider: jest.Mocked<Pick<ConfigProvider, 'get'>> = {
    get: jest.fn().mockReturnValue(MOCK_CONFIG),
  };

  const mockSnapClient: jest.Mocked<
    Pick<SnapClient, 'getBip32Entropy' | 'listEntropySources'>
  > = {
    getBip32Entropy: jest.fn().mockResolvedValue(TEST_KEY_PAIR),
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
