import type { EntropySourceId } from '@metamask/keyring-api';

import type { TronKeyringAccount } from '../../entities/keyring-account';
import type { IStateManager } from '../state/IStateManager';
import type { UnencryptedStateValue } from '../state/State';

/**
 * Range of inclusive account indices to create.
 *
 * @param from - The starting index.
 * @param to - The ending index.
 */
type AccountCreationRange = {
  from: number;
  to: number;
};

type KeyringAccountsState = Record<string, TronKeyringAccount>;

/**
 * Tron accounts use a fixed BIP-44 path template; uniqueness is entropy + index.
 *
 * @param account - The account to key.
 * @returns A stable conflict key for the account.
 */
function getAccountIndexKey(account: TronKeyringAccount): string {
  return `${account.entropySource}:${account.index}`;
}

/**
 * Finds an account in state by entropy source and index key.
 *
 * @param accounts - Existing keyring accounts.
 * @param indexKey - Conflict key from {@link getAccountIndexKey}.
 * @returns The matching account, if any.
 */
function findAccountByIndexKey(
  accounts: KeyringAccountsState,
  indexKey: string,
): TronKeyringAccount | undefined {
  return Object.values(accounts).find(
    (account) => getAccountIndexKey(account) === indexKey,
  );
}

/**
 * Merges incoming accounts into existing state, skipping entropy/index conflicts.
 *
 * @param existing - Current keyring accounts.
 * @param incoming - Accounts to merge.
 * @returns Merged state and the subset that was actually added.
 */
function mergeAccountsWithoutIndexConflicts(
  existing: KeyringAccountsState,
  incoming: KeyringAccountsState,
): { merged: KeyringAccountsState; added: KeyringAccountsState } {
  const occupiedIndices = new Set(
    Object.values(existing).map(getAccountIndexKey),
  );
  const added: KeyringAccountsState = {};

  for (const [id, account] of Object.entries(incoming)) {
    const indexKey = getAccountIndexKey(account);

    if (occupiedIndices.has(indexKey)) {
      continue;
    }

    added[id] = account;
    occupiedIndices.add(indexKey);
  }

  return {
    merged: { ...existing, ...added },
    added,
  };
}

export class AccountsRepository {
  readonly #storageKey = 'keyringAccounts';

  readonly #state: IStateManager<UnencryptedStateValue>;

  constructor(state: IStateManager<UnencryptedStateValue>) {
    this.#state = state;
  }

  /**
   * Returns all accounts from the state.
   *
   * @returns All accounts from the state.
   */
  async getAll(): Promise<TronKeyringAccount[]> {
    const accounts = await this.#state.getKey<
      UnencryptedStateValue['keyringAccounts']
    >(this.#storageKey);

    return Object.values(accounts ?? {});
  }

  /**
   * Returns accounts matching an entropy source and inclusive index range.
   *
   * @param entropySource - Entropy source to match.
   * @param range - Inclusive group index range to match.
   * @returns Matching accounts in ascending index order.
   */
  async findByEntropySourceAndRange(
    entropySource: EntropySourceId,
    range: AccountCreationRange,
  ): Promise<TronKeyringAccount[]> {
    const accounts = await this.getAll();

    return accounts
      .filter(
        (account) =>
          account.entropySource === entropySource &&
          account.index >= range.from &&
          account.index <= range.to,
      )
      .sort((first, second) => first.index - second.index);
  }

  async findById(id: string): Promise<TronKeyringAccount | null> {
    const accounts = await this.getAll();
    return accounts.find((account) => account.id === id) ?? null;
  }

  async findByIds(ids: string[]): Promise<TronKeyringAccount[]> {
    const accounts = await this.getAll();
    return accounts.filter((account) => ids.includes(account.id));
  }

  async findByAddress(address: string): Promise<TronKeyringAccount | null> {
    const accounts = await this.getAll();

    return accounts.find((account) => account.address === address) ?? null;
  }

  async create(account: TronKeyringAccount): Promise<TronKeyringAccount> {
    let persistedAccount = account;

    await this.#state.setKeyWith<KeyringAccountsState>(
      this.#storageKey,
      (current) => {
        const existing = current ?? {};
        const { merged, added } = mergeAccountsWithoutIndexConflicts(existing, {
          [account.id]: account,
        });

        if (!(account.id in added)) {
          persistedAccount =
            findAccountByIndexKey(existing, getAccountIndexKey(account)) ??
            account;
        }

        return merged;
      },
    );

    return persistedAccount;
  }

  /**
   * Merges multiple keyring accounts into `keyringAccounts` in a single atomic state update.
   *
   * @param newAccounts - The new accounts to merge.
   */
  async mergeKeyringAccounts(
    newAccounts: Record<string, TronKeyringAccount>,
  ): Promise<void> {
    await this.#state.setKeyWith<KeyringAccountsState>(
      this.#storageKey,
      (current) => {
        const existing = current ?? {};
        return mergeAccountsWithoutIndexConflicts(existing, newAccounts).merged;
      },
    );
  }

  async delete(id: string): Promise<void> {
    await Promise.all([
      this.#state.deleteKey(`${this.#storageKey}.${id}`),
      this.#state.deleteKey(`assets.${id}`),
      this.#state.deleteKey(`transactions.${id}`),
    ]);
  }
}
