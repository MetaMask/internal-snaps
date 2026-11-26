import * as KeyringSnapSdk from '@metamask/keyring-snap-sdk';
import { InvalidParamsError } from '@metamask/snaps-sdk';
import type { Mock } from 'vitest';

import { KnownCaip2ChainId } from '../../api';
import type { Wallet } from '../wallet';
import { WalletService } from '../wallet';
import {
  generateMockXrplKeyringAccounts,
  mockAccountService,
} from './__mocks__/account.fixtures';
import type { AccountService } from './AccountService';
import { AccountsRepository } from './AccountsRepository';
import type { XrplKeyringAccount } from './api';
import {
  AccountNotFoundException,
  DerivedAccountAddressMismatchException,
} from './exceptions';

describe('AccountService', () => {
  let accountService: AccountService;

  beforeEach(() => {
    accountService = mockAccountService().accountService;
  });

  type AccountsRepositorySpies = {
    saveSpy: Mock<AccountsRepository['save']>;
    saveManySpy: Mock<AccountsRepository['saveMany']>;
    deleteSpy: Mock<AccountsRepository['delete']>;
    getAllSpy: Mock<AccountsRepository['getAll']>;
    findByIdSpy: Mock<AccountsRepository['findById']>;
    findByIdsSpy: Mock<AccountsRepository['findByIds']>;
    findByAddressAndScopeSpy: Mock<AccountsRepository['findByAddressAndScope']>;
  };

  const getAccountsRepositorySpies = (): AccountsRepositorySpies => {
    return {
      saveSpy: vi.spyOn(AccountsRepository.prototype, 'save'),
      saveManySpy: vi.spyOn(AccountsRepository.prototype, 'saveMany'),
      deleteSpy: vi.spyOn(AccountsRepository.prototype, 'delete'),
      getAllSpy: vi.spyOn(AccountsRepository.prototype, 'getAll'),
      findByIdSpy: vi.spyOn(AccountsRepository.prototype, 'findById'),
      findByIdsSpy: vi.spyOn(AccountsRepository.prototype, 'findByIds'),
      findByAddressAndScopeSpy: vi.spyOn(
        AccountsRepository.prototype,
        'findByAddressAndScope',
      ),
    };
  };

  type WalletServiceSpies = {
    deriveAddressSpy: Mock<WalletService['deriveAddress']>;
  };

  const getWalletServiceSpies = (): WalletServiceSpies => ({
    deriveAddressSpy: vi.spyOn(WalletService.prototype, 'deriveAddress'),
  });

  describe('batchCreate', () => {
    it('derives, persists in range order, and calls saveMany once', async () => {
      const entropySource = 'entropy-source-default';
      const walletResolver = vi.fn(
        async (index: number) => ({ address: `address-${index}` }) as Wallet,
      );
      const { saveManySpy, getAllSpy } = getAccountsRepositorySpies();
      getAllSpy.mockResolvedValue([]);

      const result = await accountService.batchCreate({
        entropySource,
        fromIndex: 0,
        toIndex: 1,
        walletResolver,
      });

      expect(saveManySpy).toHaveBeenCalledTimes(1);
      expect(saveManySpy.mock.calls[0]?.[0]).toHaveLength(2);
      expect(result.map((account) => account.index)).toStrictEqual([0, 1]);
      expect(walletResolver).toHaveBeenCalledTimes(2);
      expect(
        walletResolver.mock.calls.map((call) => call[0]).sort((a, b) => a - b),
      ).toStrictEqual([0, 1]);
      expect(result[0]).toMatchObject({
        entropySource,
        index: 0,
        options: {
          entropy: expect.objectContaining({
            groupIndex: 0,
          }),
        },
      });
      expect(result[1]).toMatchObject({
        entropySource,
        index: 1,
        options: {
          entropy: expect.objectContaining({
            groupIndex: 1,
          }),
        },
      });
    });

    it('reuses existing accounts in the range and saves only missing accounts', async () => {
      const entropySource = 'entropy-source-batch';
      const existing = generateMockXrplKeyringAccounts(3, entropySource);
      const onlyMiddle = existing[1] as XrplKeyringAccount;
      const walletResolver = vi.fn(
        async (index: number) => ({ address: `address-${index}` }) as Wallet,
      );
      const { saveManySpy, getAllSpy } = getAccountsRepositorySpies();
      getAllSpy.mockResolvedValue([onlyMiddle]);

      const result = await accountService.batchCreate({
        entropySource,
        fromIndex: 0,
        toIndex: 2,
        walletResolver,
      });

      expect(walletResolver).toHaveBeenCalledTimes(2);
      expect(
        walletResolver.mock.calls.map((call) => call[0]).sort((a, b) => a - b),
      ).toStrictEqual([0, 2]);
      expect(saveManySpy).toHaveBeenCalledTimes(1);
      expect(saveManySpy.mock.calls[0]?.[0]).toHaveLength(2);
      expect(result[1]).toStrictEqual(onlyMiddle);
      expect(result.map((account) => account.index)).toStrictEqual([0, 1, 2]);
    });

    it('derives a large inclusive range without throwing', async () => {
      const entropySource = 'entropy-source-default';
      const walletResolver = vi.fn(
        async (index: number) => ({ address: `address-${index}` }) as Wallet,
      );
      const { saveManySpy, getAllSpy } = getAccountsRepositorySpies();
      getAllSpy.mockResolvedValue([]);

      const result = await accountService.batchCreate({
        entropySource,
        fromIndex: 0,
        toIndex: 15,
        walletResolver,
      });

      expect(result).toHaveLength(16);
      expect(walletResolver).toHaveBeenCalledTimes(16);
      expect(
        walletResolver.mock.calls.map((call) => call[0]).sort((a, b) => a - b),
      ).toStrictEqual(Array.from({ length: 16 }, (_, index) => index));
      expect(saveManySpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('delete', () => {
    it('deletes an account', async () => {
      const { deleteSpy } = getAccountsRepositorySpies();
      const [account] = generateMockXrplKeyringAccounts(
        1,
        'entropy-source-1',
      ) as [XrplKeyringAccount];

      await accountService.delete(account.id);

      expect(deleteSpy).toHaveBeenCalledWith(account.id);
    });
  });

  describe('findById', () => {
    it('finds an account by its ID', async () => {
      const { getAllSpy } = getAccountsRepositorySpies();
      const mockAccounts = generateMockXrplKeyringAccounts(
        5,
        'entropy-source-1',
      );
      const account = mockAccounts[0] as XrplKeyringAccount;
      getAllSpy.mockResolvedValue(mockAccounts);

      const result = await accountService.findById(account.id);
      expect(result).toStrictEqual(account);
    });

    it('returns undefined if the account is not found', async () => {
      const { getAllSpy } = getAccountsRepositorySpies();
      getAllSpy.mockResolvedValue([]);

      const result = await accountService.findById('non-existent-id');
      expect(result).toBeUndefined();
    });
  });

  describe('findByIds', () => {
    it('finds accounts by IDs', async () => {
      const { findByIdsSpy } = getAccountsRepositorySpies();
      const mockAccounts = generateMockXrplKeyringAccounts(
        3,
        'entropy-source-1',
      );
      const ids = mockAccounts.slice(0, 2).map((account) => account.id);
      findByIdsSpy.mockResolvedValue(mockAccounts.slice(0, 2));

      const result = await accountService.findByIds(ids);

      expect(findByIdsSpy).toHaveBeenCalledWith(ids);
      expect(result).toStrictEqual(mockAccounts.slice(0, 2));
    });
  });

  describe('findByAddressAndScope', () => {
    it('finds an account by address and scope', async () => {
      const { findByAddressAndScopeSpy } = getAccountsRepositorySpies();
      const [account] = generateMockXrplKeyringAccounts(
        1,
        'entropy-source-1',
      ) as [XrplKeyringAccount];
      findByAddressAndScopeSpy.mockResolvedValue(account);

      const result = await accountService.findByAddressAndScope(
        account.address,
        KnownCaip2ChainId.Mainnet,
      );

      expect(findByAddressAndScopeSpy).toHaveBeenCalledWith(
        account.address,
        KnownCaip2ChainId.Mainnet,
      );
      expect(result).toStrictEqual(account);
    });

    it('returns null if the account is not found', async () => {
      const { findByAddressAndScopeSpy } = getAccountsRepositorySpies();
      findByAddressAndScopeSpy.mockResolvedValue(null);

      const result = await accountService.findByAddressAndScope(
        'rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        KnownCaip2ChainId.Mainnet,
      );

      expect(result).toBeNull();
    });
  });

  describe('listAccounts', () => {
    it('lists all accounts', async () => {
      const { getAllSpy } = getAccountsRepositorySpies();
      const mockAccounts = generateMockXrplKeyringAccounts(
        5,
        'entropy-source-1',
      );
      getAllSpy.mockResolvedValue(mockAccounts);

      const result = await accountService.listAccounts();
      expect(result).toStrictEqual(mockAccounts);
    });
  });

  describe('listAccountsByScope', () => {
    it('lists accounts that include the given scope', async () => {
      const { getAllSpy } = getAccountsRepositorySpies();
      const mockAccounts = generateMockXrplKeyringAccounts(
        2,
        'entropy-source-1',
      );
      getAllSpy.mockResolvedValue(mockAccounts);

      const result = await accountService.listAccountsByScope(
        KnownCaip2ChainId.Mainnet,
      );

      expect(result).toStrictEqual(mockAccounts);
    });
  });

  describe('getAllSelected', () => {
    it('returns only accounts whose IDs are in getSelectedAccounts', async () => {
      const { getAllSpy } = getAccountsRepositorySpies();
      const mockAccounts = generateMockXrplKeyringAccounts(
        3,
        'entropy-source-1',
      );
      const selected = mockAccounts.slice(0, 2);
      getAllSpy.mockResolvedValue(mockAccounts);
      vi.spyOn(KeyringSnapSdk, 'getSelectedAccounts').mockResolvedValue(
        selected.map((account) => account.id),
      );

      const result = await accountService.getAllSelected();

      expect(result).toStrictEqual(selected);
    });
  });

  describe('resolveAccount', () => {
    it('resolves an account with given address', async () => {
      const { getAllSpy } = getAccountsRepositorySpies();
      const { deriveAddressSpy } = getWalletServiceSpies();
      const mockAccounts = generateMockXrplKeyringAccounts(
        5,
        'entropy-source-1',
      );
      const account = mockAccounts[0] as XrplKeyringAccount;
      deriveAddressSpy.mockResolvedValue(account.address);
      getAllSpy.mockResolvedValue(mockAccounts);

      const result = await accountService.resolveAccount({
        accountAddress: account.address,
        scope: KnownCaip2ChainId.Mainnet,
      });
      expect(result).toStrictEqual({
        account,
      });
    });

    it('resolves an account with given account ID', async () => {
      const { getAllSpy } = getAccountsRepositorySpies();
      const { deriveAddressSpy } = getWalletServiceSpies();
      const mockAccounts = generateMockXrplKeyringAccounts(
        5,
        'entropy-source-1',
      );
      const account = mockAccounts[0] as XrplKeyringAccount;
      deriveAddressSpy.mockResolvedValue(account.address);
      getAllSpy.mockResolvedValue(mockAccounts);

      const result = await accountService.resolveAccount({
        accountId: account.id,
        scope: KnownCaip2ChainId.Mainnet,
      });
      expect(result).toStrictEqual({
        account,
      });
    });

    it('throws AccountNotFoundException if the account address is not found in the keyring', async () => {
      const { getAllSpy } = getAccountsRepositorySpies();
      getAllSpy.mockResolvedValue([]);

      await expect(
        accountService.resolveAccount({
          accountAddress: 'rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          scope: KnownCaip2ChainId.Mainnet,
        }),
      ).rejects.toThrow(AccountNotFoundException);
    });

    it('throws AccountNotFoundException if the account id is not found in the keyring', async () => {
      const { getAllSpy } = getAccountsRepositorySpies();
      getAllSpy.mockResolvedValue([]);

      await expect(
        accountService.resolveAccount({
          accountId: '00000000-0000-0000-0000-000000000000',
          scope: KnownCaip2ChainId.Mainnet,
        }),
      ).rejects.toThrow(AccountNotFoundException);
    });

    it('throws an error if the address is not the same as the derived account address', async () => {
      const { getAllSpy } = getAccountsRepositorySpies();
      const { deriveAddressSpy } = getWalletServiceSpies();
      const mockAccounts = generateMockXrplKeyringAccounts(
        5,
        'entropy-source-1',
      );
      const account = mockAccounts[0] as XrplKeyringAccount;
      const derivedAccount = mockAccounts[1] as XrplKeyringAccount;
      getAllSpy.mockResolvedValue(mockAccounts);
      deriveAddressSpy.mockResolvedValue(derivedAccount.address);

      await expect(
        accountService.resolveAccount({
          accountAddress: account.address,
          scope: KnownCaip2ChainId.Mainnet,
        }),
      ).rejects.toThrow(DerivedAccountAddressMismatchException);
    });

    it('throws InvalidParamsError when resolving by address without scope', async () => {
      await expect(
        accountService.resolveAccount({
          accountAddress: 'rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        }),
      ).rejects.toThrow(InvalidParamsError);
    });

    it('throws InvalidParamsError when neither accountId nor accountAddress is set', async () => {
      await expect(accountService.resolveAccount({})).rejects.toThrow(
        InvalidParamsError,
      );
    });
  });
});
