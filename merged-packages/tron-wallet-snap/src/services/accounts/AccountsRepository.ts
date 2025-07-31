import type { TronKeyringAccount } from '../../entities';
import type { IStateManager } from '../state/IStateManager';
import type { UnencryptedStateValue } from '../state/State';

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

  async findById(id: string): Promise<TronKeyringAccount | null> {
    const accounts = await this.getAll();
    return accounts.find((account) => account.id === id) ?? null;
  }

  async findByAddress(address: string): Promise<TronKeyringAccount | null> {
    const accounts = await this.getAll();

    return accounts.find((account) => account.address === address) ?? null;
  }

  async create(account: TronKeyringAccount): Promise<TronKeyringAccount> {
    await this.#state.setKey(`${this.#storageKey}.${account.id}`, account);

    return account;
  }

  async delete(id: string): Promise<void> {
    await Promise.all([
      this.#state.deleteKey(`${this.#storageKey}.${id}`),
      this.#state.deleteKey(`assets.${id}`),
      this.#state.deleteKey(`transactions.${id}`),
    ]);
  }
}
