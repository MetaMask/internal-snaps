import { TrxAccountType, TrxScope } from '@metamask/keyring-api';

import { AccountsRepository } from './AccountsRepository';
import type { TronKeyringAccount } from '../../entities/keyring-account';
import { InMemoryState } from '../state/InMemoryState';
import type { UnencryptedStateValue } from '../state/State';

/**
 * Creates an empty in-memory state for repository tests.
 *
 * @param keyringAccounts - Initial keyring accounts keyed by account id.
 * @returns An in-memory state seeded with the provided accounts.
 */
function createEmptyState(
  keyringAccounts: Record<string, TronKeyringAccount> = {},
): InMemoryState<UnencryptedStateValue> {
  return new InMemoryState<UnencryptedStateValue>({
    keyringAccounts,
    assets: {},
    tokenPrices: {},
    transactions: {},
    mapInterfaceNameToId: {},
  });
}

/**
 * Builds a test keyring account with sensible defaults.
 *
 * @param overrides - Partial account fields to override defaults.
 * @returns A complete Tron keyring account for tests.
 */
function createTestAccount(
  overrides: Partial<TronKeyringAccount> = {},
): TronKeyringAccount {
  return {
    id: 'account-0',
    entropySource: 'test-entropy',
    derivationPath: "m/44'/195'/0'/0/0",
    index: 0,
    type: TrxAccountType.Eoa,
    address: 'TAddress0',
    scopes: [TrxScope.Mainnet, TrxScope.Nile, TrxScope.Shasta],
    options: {},
    methods: ['signMessage', 'signTransaction'],
    ...overrides,
  };
}

describe('AccountsRepository', () => {
  it('findByEntropySourceAndRange returns matching accounts sorted by index', async () => {
    const account0 = createTestAccount({ id: 'account-0', index: 0 });
    const account2 = createTestAccount({
      id: 'account-2',
      index: 2,
      derivationPath: "m/44'/195'/0'/0/2",
      address: 'TAddress2',
    });
    const otherEntropy = createTestAccount({
      id: 'other-entropy',
      entropySource: 'other-entropy',
      index: 1,
      derivationPath: "m/44'/195'/0'/0/1",
      address: 'TOtherEntropy',
    });
    const outOfRange = createTestAccount({
      id: 'out-of-range',
      index: 5,
      derivationPath: "m/44'/195'/0'/0/5",
      address: 'TOutOfRange',
    });
    const repository = new AccountsRepository(
      createEmptyState({
        [account0.id]: account0,
        [account2.id]: account2,
        [otherEntropy.id]: otherEntropy,
        [outOfRange.id]: outOfRange,
      }),
    );

    const result = await repository.findByEntropySourceAndRange(
      'test-entropy',
      {
        from: 0,
        to: 2,
      },
    );

    expect(result.map((account) => account.id)).toStrictEqual([
      'account-0',
      'account-2',
    ]);
  });

  it('persists a new account through create', async () => {
    const repository = new AccountsRepository(createEmptyState());
    const account = createTestAccount({ id: 'new-account' });

    const result = await repository.create(account);

    expect(result).toStrictEqual(account);
    expect(await repository.getAll()).toStrictEqual([account]);
  });

  it('delete removes account state keys', async () => {
    const account = createTestAccount({ id: 'delete-me' });
    const state = createEmptyState({ [account.id]: account });
    await state.setKey(`assets.${account.id}`, []);
    await state.setKey(`transactions.${account.id}`, []);
    const repository = new AccountsRepository(state);

    await repository.delete(account.id);

    expect(await repository.getAll()).toStrictEqual([]);
    expect(await state.getKey(`assets.${account.id}`)).toBeUndefined();
    expect(await state.getKey(`transactions.${account.id}`)).toBeUndefined();
  });

  it('skips merge entries that conflict on entropy source and index', async () => {
    const existing = createTestAccount({ id: 'existing-0' });
    const repository = new AccountsRepository(
      createEmptyState({ [existing.id]: existing }),
    );

    await repository.mergeKeyringAccounts({
      'duplicate-index': {
        ...existing,
        id: 'duplicate-index',
      },
      'new-index': {
        ...existing,
        id: 'new-index',
        index: 1,
        derivationPath: "m/44'/195'/0'/0/1",
        address: 'TAddress1',
      },
    });

    const accounts = await repository.getAll();

    expect(accounts).toHaveLength(2);
    expect(accounts.map((account) => account.id).sort()).toStrictEqual([
      'existing-0',
      'new-index',
    ]);
  });

  it('skips duplicate indices within the same merge batch', async () => {
    const base = createTestAccount({ id: 'first' });
    const repository = new AccountsRepository(createEmptyState());

    await repository.mergeKeyringAccounts({
      first: base,
      second: {
        ...base,
        id: 'second',
      },
    });

    const accounts = await repository.getAll();

    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.id).toBe('first');
  });

  it('returns the existing account when create races on the same index', async () => {
    const existing = createTestAccount({ id: 'existing-0' });
    const repository = new AccountsRepository(
      createEmptyState({ [existing.id]: existing }),
    );

    const result = await repository.create({
      ...existing,
      id: 'new-id',
    });

    expect(result.id).toBe('existing-0');
    expect(await repository.getAll()).toHaveLength(1);
  });
});
