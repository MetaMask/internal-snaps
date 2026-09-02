import type { SolanaKeyringAccount } from '../../../entities';
import type { IStateManager } from '../state/IStateManager';
import type { UnencryptedStateValue } from '../state/State';

export class AccountsRepository {
  readonly #state: IStateManager<UnencryptedStateValue>;

  constructor(state: IStateManager<UnencryptedStateValue>) {
    this.#state = state;
  }

  async getAll(): Promise<SolanaKeyringAccount[]> {
    const accounts =
      await this.#state.getKey<UnencryptedStateValue['keyringAccounts']>(
        'keyringAccounts',
      );

    return Object.values(accounts ?? {});
  }

  async findById(id: string): Promise<SolanaKeyringAccount | null> {
    return (await this.#state.getKey(`keyringAccounts.${id}`)) ?? null;
  }

  async findByIds(ids: string[]): Promise<SolanaKeyringAccount[]> {
    const idSet = new Set(ids);
    const accounts = await this.getAll();

    return accounts.filter((account) => idSet.has(account.id));
  }

  async findByAddress(address: string): Promise<SolanaKeyringAccount | null> {
    const accounts = await this.getAll();

    return accounts.find((account) => account.address === address) ?? null;
  }

  async save(account: SolanaKeyringAccount): Promise<void> {
    await this.#state.setKey(`keyringAccounts.${account.id}`, account);
  }

  async delete(id: string): Promise<void> {
    await this.#state.deleteKey(`keyringAccounts.${id}`);
  }
}
