import type { IStateManager } from '@metamask/snap-networks-utils';
import { cloneDeep } from 'lodash';

import type { KnownCaip2ChainId } from '../../api';
import type { KeyringAccountState, XrplKeyringAccount } from './api';

/**
 * Persists and retrieves Xrpl keyring accounts in snap state.
 */
export class AccountsRepository {
  readonly #storageKey = 'keyringAccounts';

  readonly #state: IStateManager<KeyringAccountState>;

  constructor(state: IStateManager<KeyringAccountState>) {
    this.#state = state;
  }

  /**
   * Returns all accounts from the keyring state.
   *
   * @returns A Promise that resolves to all accounts.
   */
  async getAll(): Promise<XrplKeyringAccount[]> {
    const accounts = await this.#state.getKey<
      KeyringAccountState['keyringAccounts']
    >(this.#storageKey);

    return Object.values(accounts ?? {});
  }

  /**
   * Finds an account by ID.
   *
   * @param id - The ID of the account to find.
   * @returns A Promise that resolves to the account if found, otherwise `null`.
   */
  async findById(id: string): Promise<XrplKeyringAccount | null> {
    const accounts = await this.getAll();
    return accounts.find((account) => account.id === id) ?? null;
  }

  /**
   * Finds accounts by IDs.
   *
   * @param ids - The IDs of the accounts to find.
   * @returns A Promise that resolves to the accounts that match the given IDs.
   */
  async findByIds(ids: string[]): Promise<XrplKeyringAccount[]> {
    const accounts = await this.getAll();
    const idsSet = new Set(ids);
    return accounts.filter((account) => idsSet.has(account.id));
  }

  /**
   * Finds an account by address.
   *
   * @param address - The XRPL classic address of the account to find.
   * @returns A Promise that resolves to the account if found, otherwise `null`.
   */
  async findByAddress(address: string): Promise<XrplKeyringAccount | null> {
    const accounts = await this.getAll();
    return accounts.find((account) => account.address === address) ?? null;
  }

  /**
   * Finds an account by address and network scope.
   *
   * @param address - The Xrpl address of the account to find.
   * @param scope - The network scope (e.g. mainnet/testnet).
   * @returns A Promise that resolves to the account if found, otherwise `null`.
   */
  async findByAddressAndScope(
    address: string,
    scope: KnownCaip2ChainId,
  ): Promise<XrplKeyringAccount | null> {
    const accounts = await this.getAll();
    return (
      accounts.find(
        (account) =>
          account.address === address && account.scopes.includes(scope),
      ) ?? null
    );
  }

  /**
   * Persists a new account in keyring state.
   *
   * @param account - The account to create.
   * @returns A Promise that resolves when the account has been written.
   */
  async save(account: XrplKeyringAccount): Promise<void> {
    await this.#state.setKey(`${this.#storageKey}.${account.id}`, account);
  }

  /**
   * Persists multiple accounts in keyring state, reconciling by address.
   *
   * Inside the atomic state update, if an account with the same address already
   * exists (including earlier entries in this batch), that existing account is
   * reused and the new id is not written. This prevents concurrent creates of
   * the same address from producing duplicate IDs.
   *
   * @param accounts - The accounts to create.
   * @returns The canonical accounts in input order (existing id when reconciled).
   */
  async saveManyAndReconciledByAddress(
    accounts: XrplKeyringAccount[],
  ): Promise<XrplKeyringAccount[]> {
    if (accounts.length === 0) {
      return [];
    }

    const resolved: XrplKeyringAccount[] = [];

    await this.#state.update((state) => {
      const newState = cloneDeep(state);
      if (!newState[this.#storageKey]) {
        newState[this.#storageKey] = {};
      }

      const accountsByAddress = new Map<string, XrplKeyringAccount>(
        Object.values(newState[this.#storageKey]).map((account) => [
          account.address,
          account,
        ]),
      );

      for (const account of accounts) {
        const existing = accountsByAddress.get(account.address);
        if (existing !== undefined) {
          resolved.push(existing);
          continue;
        }

        newState[this.#storageKey][account.id] = account;
        accountsByAddress.set(account.address, account);
        resolved.push(account);
      }

      return newState;
    });

    return resolved;
  }

  /**
   * Deletes an account by ID.
   *
   * @param id - The ID of the account to delete.
   * @returns A Promise that resolves when the account has been deleted.
   */
  async delete(id: string): Promise<void> {
    await this.#state.deleteKey(`${this.#storageKey}.${id}`);
  }
}
