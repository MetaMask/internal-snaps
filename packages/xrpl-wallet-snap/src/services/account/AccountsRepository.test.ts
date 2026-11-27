import { InMemoryState } from '@metamask/snap-networks-utils';

import { KnownCaip2ChainId } from '../../api';
import { DEFAULT_UNENCRYPTED_STATE } from '../state/stateTypes';
import {
  generateMockXrplKeyringAccounts,
  generateXrplKeyringAccount,
} from './__mocks__/account.fixtures';
import { AccountsRepository } from './AccountsRepository';
import type { KeyringAccountState, XrplKeyringAccount } from './api';

/**
 * Creates an in-memory state for repository tests.
 *
 * @param keyringAccounts - Initial keyring accounts keyed by account id.
 * @returns An in-memory state seeded with the provided accounts.
 */
function createState(
  keyringAccounts: Record<string, XrplKeyringAccount> = {},
): InMemoryState<KeyringAccountState> {
  return new InMemoryState<KeyringAccountState>({
    ...DEFAULT_UNENCRYPTED_STATE,
    keyringAccounts,
  });
}

describe('AccountsRepository', () => {
  describe('getAll', () => {
    it('returns an empty list when no accounts exist', async () => {
      const repository = new AccountsRepository(createState());

      expect(await repository.getAll()).toStrictEqual([]);
    });

    it('returns all persisted accounts', async () => {
      const [account1, account2] = generateMockXrplKeyringAccounts(
        2,
        'entropy-source-1',
      ) as [XrplKeyringAccount, XrplKeyringAccount];
      const repository = new AccountsRepository(
        createState({
          [account1.id]: account1,
          [account2.id]: account2,
        }),
      );

      expect(await repository.getAll()).toStrictEqual(
        expect.arrayContaining([account1, account2]),
      );
      expect(await repository.getAll()).toHaveLength(2);
    });
  });

  describe('findById', () => {
    it('returns the matching account', async () => {
      const [account] = generateMockXrplKeyringAccounts(
        1,
        'entropy-source-1',
      ) as [XrplKeyringAccount];
      const repository = new AccountsRepository(
        createState({ [account.id]: account }),
      );

      expect(await repository.findById(account.id)).toStrictEqual(account);
    });

    it('returns null when the account is missing', async () => {
      const repository = new AccountsRepository(createState());

      expect(await repository.findById('missing-id')).toBeNull();
    });
  });

  describe('findByIds', () => {
    it('returns only accounts that match the given IDs', async () => {
      const [account1, account2, account3] = generateMockXrplKeyringAccounts(
        3,
        'entropy-source-1',
      ) as [XrplKeyringAccount, XrplKeyringAccount, XrplKeyringAccount];
      const repository = new AccountsRepository(
        createState({
          [account1.id]: account1,
          [account2.id]: account2,
          [account3.id]: account3,
        }),
      );

      const result = await repository.findByIds([
        account1.id,
        account3.id,
        'missing-id',
      ]);

      expect(result).toStrictEqual([account1, account3]);
    });
  });

  describe('findByAddress', () => {
    it('returns the matching account', async () => {
      const [account] = generateMockXrplKeyringAccounts(
        1,
        'entropy-source-1',
      ) as [XrplKeyringAccount];
      const repository = new AccountsRepository(
        createState({ [account.id]: account }),
      );

      expect(await repository.findByAddress(account.address)).toStrictEqual(
        account,
      );
    });

    it('returns null when the address is missing', async () => {
      const repository = new AccountsRepository(createState());

      expect(
        await repository.findByAddress('rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
      ).toBeNull();
    });
  });

  describe('findByAddressAndScope', () => {
    it('returns the matching account for address and scope', async () => {
      const [account] = generateMockXrplKeyringAccounts(
        1,
        'entropy-source-1',
      ) as [XrplKeyringAccount];
      const repository = new AccountsRepository(
        createState({ [account.id]: account }),
      );

      expect(
        await repository.findByAddressAndScope(
          account.address,
          KnownCaip2ChainId.Mainnet,
        ),
      ).toStrictEqual(account);
    });

    it('returns null when the address exists but the scope does not match', async () => {
      const account = generateXrplKeyringAccount(
        globalThis.crypto.randomUUID(),
        'rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3',
        'entropy-source-1',
        0,
      );
      account.scopes = [];
      const repository = new AccountsRepository(
        createState({ [account.id]: account }),
      );

      expect(
        await repository.findByAddressAndScope(
          account.address,
          KnownCaip2ChainId.Mainnet,
        ),
      ).toBeNull();
    });
  });

  describe('save', () => {
    it('persists a new account', async () => {
      const repository = new AccountsRepository(createState());
      const [account] = generateMockXrplKeyringAccounts(
        1,
        'entropy-source-1',
      ) as [XrplKeyringAccount];

      await repository.save(account);

      expect(await repository.getAll()).toStrictEqual([account]);
    });
  });

  describe('saveManyAndReconciledByAddress', () => {
    it('persists multiple accounts', async () => {
      const repository = new AccountsRepository(createState());
      const accounts = generateMockXrplKeyringAccounts(2, 'entropy-source-1');

      const result = await repository.saveManyAndReconciledByAddress(accounts);

      expect(result).toStrictEqual(accounts);
      expect(await repository.getAll()).toStrictEqual(
        expect.arrayContaining(accounts),
      );
      expect(await repository.getAll()).toHaveLength(2);
    });

    it('returns an empty list for an empty input without updating state', async () => {
      const state = createState();
      const updateSpy = vi.spyOn(state, 'update');
      const repository = new AccountsRepository(state);

      const result = await repository.saveManyAndReconciledByAddress([]);

      expect(result).toStrictEqual([]);
      expect(updateSpy).not.toHaveBeenCalled();
      expect(await repository.getAll()).toStrictEqual([]);
    });

    it('reuses an existing account with the same address and does not write a second id', async () => {
      const [existing] = generateMockXrplKeyringAccounts(
        1,
        'entropy-source-1',
      ) as [XrplKeyringAccount];
      const repository = new AccountsRepository(
        createState({ [existing.id]: existing }),
      );
      const duplicate = generateXrplKeyringAccount(
        globalThis.crypto.randomUUID(),
        existing.address,
        'entropy-source-1',
        existing.index,
      );

      const result = await repository.saveManyAndReconciledByAddress([
        duplicate,
      ]);

      expect(result).toStrictEqual([existing]);
      expect(await repository.getAll()).toStrictEqual([existing]);
    });

    it('collapses duplicate addresses within the same batch to one write', async () => {
      const repository = new AccountsRepository(createState());
      const first = generateXrplKeyringAccount(
        globalThis.crypto.randomUUID(),
        'rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3',
        'entropy-source-1',
        0,
      );
      const second = generateXrplKeyringAccount(
        globalThis.crypto.randomUUID(),
        first.address,
        'entropy-source-1',
        0,
      );

      const result = await repository.saveManyAndReconciledByAddress([
        first,
        second,
      ]);

      expect(result).toStrictEqual([first, first]);
      expect(await repository.getAll()).toStrictEqual([first]);
    });
  });

  describe('delete', () => {
    it('removes an account by id', async () => {
      const [account] = generateMockXrplKeyringAccounts(
        1,
        'entropy-source-1',
      ) as [XrplKeyringAccount];
      const repository = new AccountsRepository(
        createState({ [account.id]: account }),
      );

      await repository.delete(account.id);

      expect(await repository.getAll()).toStrictEqual([]);
    });
  });
});
