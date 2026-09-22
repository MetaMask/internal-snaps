import { KnownCaip2ChainId } from '../../api';
import { mockBip32Node } from '../../utils/__mocks__/fixtures';
import { getBip32Entropy, getDefaultEntropySource } from '../../utils/snap';
import { WalletService } from '../wallet';
import type { Wallet } from '../wallet/Wallet';
import {
  generateMockStellarKeyringAccounts,
  mockAccountService,
} from './__mocks__/account.fixtures';
import type { AccountService } from './AccountService';
import { AccountsRepository } from './AccountsRepository';
import type { StellarKeyringAccount } from './api';
import {
  AccountNotFoundException,
  DerivedAccountAddressMismatchException,
} from './exceptions';

jest.mock('../../utils/logger');
jest.mock('../../utils/snap');

describe('AccountService', () => {
  let accountService: AccountService;

  beforeEach(() => {
    // Mock the entropy source to let the wallet service derive the address
    jest.mocked(getBip32Entropy).mockResolvedValue(mockBip32Node);
    accountService = mockAccountService().accountService;
  });

  type AccountsRepositorySpies = {
    saveSpy: jest.SpiedFunction<AccountsRepository['save']>;
    saveManySpy: jest.SpiedFunction<AccountsRepository['saveMany']>;
    deleteSpy: jest.SpiedFunction<AccountsRepository['delete']>;
    getAllSpy: jest.SpiedFunction<AccountsRepository['getAll']>;
  };

  const getAccountsRepositorySpies = (): AccountsRepositorySpies => {
    return {
      saveSpy: jest.spyOn(AccountsRepository.prototype, 'save'),
      saveManySpy: jest.spyOn(AccountsRepository.prototype, 'saveMany'),
      deleteSpy: jest.spyOn(AccountsRepository.prototype, 'delete'),
      getAllSpy: jest.spyOn(AccountsRepository.prototype, 'getAll'),
    };
  };

  type WalletServiceSpies = {
    deriveAddressSpy: jest.SpiedFunction<WalletService['deriveAddress']>;
  };

  const getWalletServiceSpies = (): WalletServiceSpies => ({
    deriveAddressSpy: jest.spyOn(WalletService.prototype, 'deriveAddress'),
  });

  describe('batchCreate', () => {
    it('derives, persists in range order, and calls save once', async () => {
      const entropySource = 'entropy-source-default';
      const walletResolver = jest.fn(
        async (index: number) => ({ address: `address-${index}` }) as Wallet,
      );
      const { saveManySpy, getAllSpy } = getAccountsRepositorySpies();
      getAllSpy.mockResolvedValue([]);
      jest.mocked(getDefaultEntropySource).mockResolvedValue(entropySource);

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
      const existing = generateMockStellarKeyringAccounts(3, entropySource);
      const onlyMiddle = existing[1] as StellarKeyringAccount;
      const walletResolver = jest.fn(
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
      expect(result.map((a) => a.index)).toStrictEqual([0, 1, 2]);
    });

    it('derives a large inclusive range without throwing', async () => {
      const entropySource = 'entropy-source-default';
      const walletResolver = jest.fn(
        async (index: number) => ({ address: `address-${index}` }) as Wallet,
      );
      const { saveManySpy, getAllSpy } = getAccountsRepositorySpies();
      getAllSpy.mockResolvedValue([]);
      jest.mocked(getDefaultEntropySource).mockResolvedValue(entropySource);

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
      const [account] = generateMockStellarKeyringAccounts(
        1,
        'entropy-source-1',
      ) as [StellarKeyringAccount];

      await accountService.delete(account.id);

      expect(deleteSpy).toHaveBeenCalledWith(account.id);
    });
  });

  describe('findById', () => {
    it('finds an account by its ID', async () => {
      const { getAllSpy } = getAccountsRepositorySpies();
      const mockAccounts = generateMockStellarKeyringAccounts(
        5,
        'entropy-source-1',
      );
      const account = mockAccounts[0] as StellarKeyringAccount;
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

  describe('listAccounts', () => {
    it('lists all accounts', async () => {
      const { getAllSpy } = getAccountsRepositorySpies();
      const mockAccounts = generateMockStellarKeyringAccounts(
        5,
        'entropy-source-1',
      );
      getAllSpy.mockResolvedValue(mockAccounts);

      const result = await accountService.listAccounts();
      expect(result).toStrictEqual(mockAccounts);
    });
  });

  describe('resolveAccount', () => {
    it('resolves an account regardless of activation status with given address', async () => {
      const { getAllSpy } = getAccountsRepositorySpies();
      const { deriveAddressSpy } = getWalletServiceSpies();
      const mockAccounts = generateMockStellarKeyringAccounts(
        5,
        'entropy-source-1',
      );
      const account = mockAccounts[0] as StellarKeyringAccount;
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

    it('resolves an account regardless of activation status with given account ID', async () => {
      const { getAllSpy } = getAccountsRepositorySpies();
      const { deriveAddressSpy } = getWalletServiceSpies();
      const mockAccounts = generateMockStellarKeyringAccounts(
        5,
        'entropy-source-1',
      );
      const account = mockAccounts[0] as StellarKeyringAccount;
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
          accountAddress:
            'GNXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
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
      const mockAccounts = generateMockStellarKeyringAccounts(
        5,
        'entropy-source-1',
      );
      const account = mockAccounts[0] as StellarKeyringAccount;
      const derivedAccount = mockAccounts[1] as StellarKeyringAccount;
      getAllSpy.mockResolvedValue(mockAccounts);
      deriveAddressSpy.mockResolvedValue(derivedAccount.address);

      await expect(
        accountService.resolveAccount({
          accountAddress: account.address,
          scope: KnownCaip2ChainId.Mainnet,
        }),
      ).rejects.toThrow(DerivedAccountAddressMismatchException);
    });
  });
});
