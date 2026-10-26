import { hexToBytes } from '@metamask/utils';
import { Keypair } from '@stellar/stellar-sdk';
import { BigNumber } from 'bignumber.js';

import { KnownCaip2ChainId } from '../../api';
import { bufferToUint8Array } from '../../utils/buffer';
import {
  generateMockStellarKeyringAccounts,
  generateStellarKeyringAccount,
} from '../account/__mocks__/account.fixtures';
import { DerivedAccountAddressMismatchException } from '../account/exceptions';
import { AssetMetadataService } from '../asset-metadata';
import {
  getMockSep41Assets,
  USDC_SEP41,
  USDT_SEP41,
} from '../asset-metadata/__mocks__/assets.fixtures';
import { AccountNotActivatedException, NetworkService } from '../network';
import {
  generateStellarAddress,
  getTestWallet,
} from '../wallet/__mocks__/wallet.fixtures';
import {
  createMockAccountWithBalances,
  DEFAULT_MOCK_ACCOUNT_WITH_BALANCES,
  horizonSource,
  mockOnChainAccountService,
} from './__mocks__/onChainAccount.fixtures';
import { OnChainAccountSep41BalanceNotFoundException } from './exceptions';
import { OnChainAccount } from './OnChainAccount';
import type { OnChainAccountSerializableFull } from './OnChainAccountSerializable';
import {
  BALANCE_STALE_AFTER_MS,
  OnChainAccountService,
} from './OnChainAccountService';
import { OnChainAccountSynchronizeService } from './OnChainAccountSynchronizeService';

jest.mock('../../utils/logger');
jest.mock('../../utils/snap');

describe('OnChainAccountService', () => {
  const seed = hexToBytes(
    '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  );

  const getNetworkServiceSpies = () => ({
    getAccountSpy: jest.spyOn(NetworkService.prototype, 'getAccount'),
    loadOnChainAccountSpy: jest.spyOn(
      NetworkService.prototype,
      'loadOnChainAccount',
    ),
    getSep41AssetBalancesSpy: jest.spyOn(
      NetworkService.prototype,
      'getSep41AssetBalances',
    ),
  });

  describe('isAccountActivated', () => {
    it('returns true when getAccount returns an account', async () => {
      const { getAccountSpy } = getNetworkServiceSpies();
      const wallet = getTestWallet({ seed });
      const onChainAcc = createMockAccountWithBalances(
        wallet.address,
        '1',
        DEFAULT_MOCK_ACCOUNT_WITH_BALANCES,
      );
      const onChain = new OnChainAccount(
        onChainAcc,
        KnownCaip2ChainId.Mainnet,
        horizonSource(onChainAcc, KnownCaip2ChainId.Mainnet),
      );
      getAccountSpy.mockResolvedValue(onChain);

      const { onChainAccountService } = mockOnChainAccountService();
      const result = await onChainAccountService.isAccountActivated({
        accountAddress: onChain.accountId,
        scope: KnownCaip2ChainId.Mainnet,
      });

      expect(result).toBe(true);
    });

    it('returns false when getAccount throws AccountNotActivatedException', async () => {
      const { getAccountSpy } = getNetworkServiceSpies();
      const accountAddress = generateStellarAddress();
      getAccountSpy.mockRejectedValue(
        new AccountNotActivatedException(
          accountAddress,
          KnownCaip2ChainId.Mainnet,
        ),
      );

      const { onChainAccountService } = mockOnChainAccountService();
      const result = await onChainAccountService.isAccountActivated({
        accountAddress,
        scope: KnownCaip2ChainId.Mainnet,
      });

      expect(result).toBe(false);
    });

    it('rethrows errors other than AccountNotActivatedException', async () => {
      const { getAccountSpy } = getNetworkServiceSpies();
      const accountAddress = generateStellarAddress();
      getAccountSpy.mockRejectedValue(new Error('Horizon unavailable'));

      const { onChainAccountService } = mockOnChainAccountService();

      await expect(
        onChainAccountService.isAccountActivated({
          accountAddress,
          scope: KnownCaip2ChainId.Mainnet,
        }),
      ).rejects.toThrow('Horizon unavailable');
    });
  });

  describe('resolveOnChainAccount', () => {
    type Sep41BalancesByAccount = Awaited<
      ReturnType<NetworkService['getSep41AssetBalances']>
    >;

    type ResolveOnChainAccountSetup = {
      accountAddress: string;
      scope: KnownCaip2ChainId;
      loadOnChainAccountSpy: jest.SpyInstance;
      getSep41AssetBalancesSpy: jest.SpyInstance;
      onChainAccountService: OnChainAccountService;
    };

    const setupResolveOnChainAccount = ({
      scope = KnownCaip2ChainId.Mainnet,
      loadedAccountId,
      sep41Catalog,
      stubSep41Catalog = false,
      sep41Balances,
      sep41BalancesError,
    }: {
      scope?: KnownCaip2ChainId;
      loadedAccountId?: string;
      sep41Catalog?: ReturnType<typeof getMockSep41Assets>;
      stubSep41Catalog?: boolean;
      sep41Balances?: (accountAddress: string) => Sep41BalancesByAccount;
      sep41BalancesError?: Error;
    } = {}): ResolveOnChainAccountSetup => {
      const accountAddress = generateStellarAddress();
      const horizonAccountId = loadedAccountId ?? accountAddress;
      const loadedAcc = createMockAccountWithBalances(
        horizonAccountId,
        '1',
        DEFAULT_MOCK_ACCOUNT_WITH_BALANCES,
      );
      const loaded = new OnChainAccount(
        loadedAcc,
        scope,
        horizonSource(loadedAcc, scope),
      );
      const { loadOnChainAccountSpy, getSep41AssetBalancesSpy } =
        getNetworkServiceSpies();
      loadOnChainAccountSpy.mockResolvedValue(loaded);

      const fetchSep41Spy = jest.spyOn(
        AssetMetadataService.prototype,
        'fetchSep41AssetsOrSyncOnce',
      );
      const shouldStubSep41 =
        stubSep41Catalog ||
        sep41Catalog !== undefined ||
        sep41Balances !== undefined ||
        sep41BalancesError !== undefined;
      if (shouldStubSep41) {
        fetchSep41Spy.mockResolvedValue(sep41Catalog ?? getMockSep41Assets());
      }
      if (sep41BalancesError !== undefined) {
        getSep41AssetBalancesSpy.mockRejectedValue(sep41BalancesError);
      } else if (sep41Balances !== undefined) {
        getSep41AssetBalancesSpy.mockResolvedValue(
          sep41Balances(accountAddress),
        );
      }

      const { onChainAccountService } = mockOnChainAccountService();

      return {
        accountAddress,
        scope,
        loadOnChainAccountSpy,
        getSep41AssetBalancesSpy,
        onChainAccountService,
      };
    };

    it('returns loaded account when Horizon account id matches the requested address', async () => {
      const { accountAddress, loadOnChainAccountSpy, onChainAccountService } =
        setupResolveOnChainAccount();
      const keyringAccount = generateStellarKeyringAccount(
        globalThis.crypto.randomUUID(),
        accountAddress,
        'entropy-source-1',
        0,
      );

      const result = await onChainAccountService.resolveOnChainAccount(
        keyringAccount.address,
        KnownCaip2ChainId.Mainnet,
      );

      expect(result.accountId).toStrictEqual(accountAddress);
      expect(loadOnChainAccountSpy).toHaveBeenCalledWith(
        keyringAccount.address,
        KnownCaip2ChainId.Mainnet,
      );
    });

    it('throws when loaded account id does not match the requested address', async () => {
      const { accountAddress, scope, onChainAccountService } =
        setupResolveOnChainAccount({
          loadedAccountId: generateStellarAddress(),
        });

      await expect(
        onChainAccountService.resolveOnChainAccount(accountAddress, scope),
      ).rejects.toThrow(DerivedAccountAddressMismatchException);
    });

    it('binds SEP-41 balances including zero when resolveWithFullBalance is set', async () => {
      const {
        accountAddress,
        scope,
        onChainAccountService,
        getSep41AssetBalancesSpy,
      } = setupResolveOnChainAccount({
        sep41Balances: (address) => ({
          [address]: {
            [USDC_SEP41]: new BigNumber(10_000_000),
            [USDT_SEP41]: new BigNumber(0),
          },
        }),
      });

      const result = await onChainAccountService.resolveOnChainAccount(
        accountAddress,
        scope,
        { resolveWithFullBalance: true },
      );

      expect(getSep41AssetBalancesSpy).toHaveBeenCalledWith({
        accounts: [accountAddress],
        assetIds: [USDC_SEP41, USDT_SEP41],
        scope,
      });
      expect(result.getRawAsset(USDC_SEP41)?.balance.toFixed()).toBe(
        '10000000',
      );
      expect(result.getAsset(USDC_SEP41)?.symbol).toBe('USDC');
      expect(result.getRawAsset(USDT_SEP41)?.balance.toFixed()).toBe('0');
      expect(result.getAsset(USDT_SEP41)).toBeUndefined();
    });

    it('returns the Horizon account when the SEP-41 catalog is empty', async () => {
      const {
        accountAddress,
        scope,
        onChainAccountService,
        getSep41AssetBalancesSpy,
      } = setupResolveOnChainAccount({
        sep41Catalog: [],
      });

      const result = await onChainAccountService.resolveOnChainAccount(
        accountAddress,
        scope,
        { resolveWithFullBalance: true },
      );

      expect(result.accountId).toStrictEqual(accountAddress);
      expect(getSep41AssetBalancesSpy).not.toHaveBeenCalled();
    });

    it('returns the Horizon account when testnet has no SEP-41 balance map', async () => {
      const {
        accountAddress,
        scope,
        onChainAccountService,
        getSep41AssetBalancesSpy,
      } = setupResolveOnChainAccount({
        scope: KnownCaip2ChainId.Testnet,
        stubSep41Catalog: true,
      });

      const result = await onChainAccountService.resolveOnChainAccount(
        accountAddress,
        scope,
        { resolveWithFullBalance: true },
      );

      expect(getSep41AssetBalancesSpy).toHaveBeenCalledWith({
        accounts: [accountAddress],
        assetIds: [USDC_SEP41, USDT_SEP41],
        scope,
      });
      expect(result.accountId).toStrictEqual(accountAddress);
      expect(result.getRawAsset(USDC_SEP41)).toBeUndefined();
      expect(result.getRawAsset(USDT_SEP41)).toBeUndefined();
    });

    it('throws when mainnet returns no SEP-41 balance map for the account', async () => {
      const { accountAddress, scope, onChainAccountService } =
        setupResolveOnChainAccount({
          sep41Balances: () => ({}),
        });

      await expect(
        onChainAccountService.resolveOnChainAccount(accountAddress, scope, {
          resolveWithFullBalance: true,
        }),
      ).rejects.toThrow(
        new OnChainAccountSep41BalanceNotFoundException(accountAddress),
      );
    });

    it('skips an unread SEP-41 cell and binds the rest', async () => {
      const { accountAddress, scope, onChainAccountService } =
        setupResolveOnChainAccount({
          sep41Balances: (address) => ({
            [address]: {
              [USDC_SEP41]: null,
              [USDT_SEP41]: new BigNumber(1),
            },
          }),
        });

      const result = await onChainAccountService.resolveOnChainAccount(
        accountAddress,
        scope,
        { resolveWithFullBalance: true },
      );

      expect(result.getRawAsset(USDC_SEP41)).toBeUndefined();
      expect(result.getRawAsset(USDT_SEP41)?.balance.toFixed()).toBe('1');
    });

    it('skips a SEP-41 asset id missing from the balance map and binds the rest', async () => {
      const { accountAddress, scope, onChainAccountService } =
        setupResolveOnChainAccount({
          sep41Balances: (address) => ({
            [address]: {
              [USDC_SEP41]: new BigNumber(1),
            },
          }),
        });

      const result = await onChainAccountService.resolveOnChainAccount(
        accountAddress,
        scope,
        { resolveWithFullBalance: true },
      );

      expect(result.getRawAsset(USDC_SEP41)?.balance.toFixed()).toBe('1');
      expect(result.getRawAsset(USDT_SEP41)).toBeUndefined();
    });

    it('propagates a SEP-41 balance read failure', async () => {
      const { accountAddress, scope, onChainAccountService } =
        setupResolveOnChainAccount({
          sep41BalancesError: new Error('Failed to load SEP-41 token balance'),
        });

      await expect(
        onChainAccountService.resolveOnChainAccount(accountAddress, scope, {
          resolveWithFullBalance: true,
        }),
      ).rejects.toThrow('Failed to load SEP-41 token balance');
    });
  });

  describe('resolveOnChainAccountByKeyringAccountId', () => {
    it('returns null when no snapshot exists for the keyring id and scope', async () => {
      const keyringAccountId = globalThis.crypto.randomUUID();
      const { onChainAccountService, onChainAccountRepository } =
        mockOnChainAccountService();
      const findByAccountIdSpy = jest.spyOn(
        onChainAccountRepository,
        'findByKeyringAccountId',
      );
      findByAccountIdSpy.mockResolvedValue(null);

      const result =
        await onChainAccountService.resolveOnChainAccountByKeyringAccountId(
          keyringAccountId,
          KnownCaip2ChainId.Mainnet,
        );

      expect(result).toBeNull();
      expect(findByAccountIdSpy).toHaveBeenCalledWith(
        keyringAccountId,
        KnownCaip2ChainId.Mainnet,
      );
    });

    it('returns rehydrated OnChainAccount when a snapshot exists', async () => {
      const signer = Keypair.fromRawEd25519Seed(bufferToUint8Array(seed));
      const keyringAccountId = globalThis.crypto.randomUUID();
      const loadedAcc = createMockAccountWithBalances(
        signer.publicKey(),
        '1',
        DEFAULT_MOCK_ACCOUNT_WITH_BALANCES,
      );
      const binding = horizonSource(
        loadedAcc,
        KnownCaip2ChainId.Mainnet,
      ) as OnChainAccountSerializableFull;

      const { onChainAccountService, onChainAccountRepository } =
        mockOnChainAccountService();
      const findByAccountIdSpy = jest.spyOn(
        onChainAccountRepository,
        'findByKeyringAccountId',
      );
      findByAccountIdSpy.mockResolvedValue(binding);

      const result =
        await onChainAccountService.resolveOnChainAccountByKeyringAccountId(
          keyringAccountId,
          KnownCaip2ChainId.Mainnet,
        );

      expect(result).toBeInstanceOf(OnChainAccount);
      expect(result?.accountId).toStrictEqual(signer.publicKey());
      expect(findByAccountIdSpy).toHaveBeenCalledWith(
        keyringAccountId,
        KnownCaip2ChainId.Mainnet,
      );
    });
  });

  describe('synchronize', () => {
    it('calls OnChainAccountSynchronizeService', async () => {
      const keyringAccounts = generateMockStellarKeyringAccounts(
        2,
        'entropy-source-1',
      );
      const activatedAccountPairs = keyringAccounts.map((keyringAccount) => ({
        keyringAccount,
        onChainAccount: OnChainAccount.fromSerializable(
          horizonSource(
            createMockAccountWithBalances(
              keyringAccount.address,
              '1',
              DEFAULT_MOCK_ACCOUNT_WITH_BALANCES,
            ),
            KnownCaip2ChainId.Mainnet,
          ) as OnChainAccountSerializableFull,
        ),
      }));
      const { onChainAccountService } = mockOnChainAccountService();
      const synchronizeSpy = jest.spyOn(
        OnChainAccountSynchronizeService.prototype,
        'synchronize',
      );

      await onChainAccountService.synchronize(
        activatedAccountPairs,
        KnownCaip2ChainId.Mainnet,
        [],
      );

      expect(synchronizeSpy).toHaveBeenCalledWith(
        activatedAccountPairs,
        KnownCaip2ChainId.Mainnet,
        [],
      );
    });
  });

  describe('recordSyncOutcome / isBalanceStale (v6)', () => {
    const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
    const scope = KnownCaip2ChainId.Mainnet;

    it('is not stale when the account was not polled yet or the syncs succeed', async () => {
      const { onChainAccountService } = mockOnChainAccountService();

      expect(await onChainAccountService.isBalanceStale(ACCOUNT_A, scope)).toBe(
        false,
      );
      await onChainAccountService.recordSyncOutcome(
        { succeededIds: [ACCOUNT_A], failedIds: [] },
        scope,
        1_000,
      );
      expect(
        await onChainAccountService.isBalanceStale(
          ACCOUNT_A,
          scope,
          1_000 + 10 * BALANCE_STALE_AFTER_MS,
        ),
      ).toBe(false);
    });

    it('is stale once the last success is older than the threshold and the syncs since then failed', async () => {
      const { onChainAccountService } = mockOnChainAccountService();
      await onChainAccountService.recordSyncOutcome(
        { succeededIds: [ACCOUNT_A], failedIds: [] },
        scope,
        1_000,
      );
      await onChainAccountService.recordSyncOutcome(
        { succeededIds: [], failedIds: [ACCOUNT_A] },
        scope,
        31_000,
      );
      await onChainAccountService.recordSyncOutcome(
        { succeededIds: [], failedIds: [ACCOUNT_A] },
        scope,
        61_000,
      );

      expect(
        await onChainAccountService.isBalanceStale(
          ACCOUNT_A,
          scope,
          1_000 + BALANCE_STALE_AFTER_MS - 1,
        ),
      ).toBe(false);
      expect(
        await onChainAccountService.isBalanceStale(
          ACCOUNT_A,
          scope,
          1_000 + BALANCE_STALE_AFTER_MS,
        ),
      ).toBe(true);

      // Cleared as soon as a sync succeeds.
      await onChainAccountService.recordSyncOutcome(
        { succeededIds: [ACCOUNT_A], failedIds: [] },
        scope,
        200_000,
      );
      expect(
        await onChainAccountService.isBalanceStale(ACCOUNT_A, scope, 200_001),
      ).toBe(false);
    });

    it('counts from the first failure when no success was seen by this instance', async () => {
      const { onChainAccountService } = mockOnChainAccountService();
      await onChainAccountService.recordSyncOutcome(
        { succeededIds: [], failedIds: [ACCOUNT_A] },
        scope,
        50_000,
      );

      expect(
        await onChainAccountService.isBalanceStale(
          ACCOUNT_A,
          scope,
          50_000 + BALANCE_STALE_AFTER_MS - 1,
        ),
      ).toBe(false);
      expect(
        await onChainAccountService.isBalanceStale(
          ACCOUNT_A,
          scope,
          50_000 + BALANCE_STALE_AFTER_MS,
        ),
      ).toBe(true);
    });
  });

  describe('markAccountsUnfunded / isConfirmedUnfunded', () => {
    const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
    const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';

    beforeEach(() => {
      jest.mocked(snap.request).mockReset();
    });

    it('marks accounts and emits a confirmed zero native balance once', async () => {
      const { onChainAccountService } = mockOnChainAccountService();

      const marked = await onChainAccountService.markAccountsUnfunded(
        [ACCOUNT_A],
        KnownCaip2ChainId.Mainnet,
      );

      expect(marked).toStrictEqual([ACCOUNT_A]);
      expect(
        await onChainAccountService.isConfirmedUnfunded(
          ACCOUNT_A,
          KnownCaip2ChainId.Mainnet,
        ),
      ).toBe(true);
      expect(snap.request).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(jest.mocked(snap.request).mock.calls[0])).toContain(
        'notify:accountBalancesUpdated',
      );
      expect(JSON.stringify(jest.mocked(snap.request).mock.calls[0])).toContain(
        ACCOUNT_A,
      );

      // Already marked: no second event.
      await onChainAccountService.markAccountsUnfunded(
        [ACCOUNT_A],
        KnownCaip2ChainId.Mainnet,
      );
      expect(snap.request).toHaveBeenCalledTimes(1);
    });

    it('reports never-synchronized accounts as not confirmed unfunded', async () => {
      const { onChainAccountService } = mockOnChainAccountService();

      expect(
        await onChainAccountService.isConfirmedUnfunded(
          ACCOUNT_B,
          KnownCaip2ChainId.Mainnet,
        ),
      ).toBe(false);
    });

    it('still records the marker when emitting the balance event fails', async () => {
      const { onChainAccountService } = mockOnChainAccountService();
      jest
        .mocked(snap.request)
        .mockRejectedValueOnce(new Error('emit failed'))
        .mockResolvedValue(null);

      const marked = await onChainAccountService.markAccountsUnfunded(
        [ACCOUNT_B],
        KnownCaip2ChainId.Mainnet,
      );

      expect(marked).toStrictEqual([ACCOUNT_B]);
      expect(
        await onChainAccountService.isConfirmedUnfunded(
          ACCOUNT_B,
          KnownCaip2ChainId.Mainnet,
        ),
      ).toBe(true);
    });
  });
});
