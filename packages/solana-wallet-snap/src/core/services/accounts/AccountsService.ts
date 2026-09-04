import { getSelectedAccounts } from '@metamask/keyring-snap-sdk';

import type { SolanaKeyringAccount } from '../../../entities';
import type { AccountsRepository } from './AccountsRepository';

export class AccountsService {
  readonly #accountsRepository: AccountsRepository;

  constructor(accountsRepository: AccountsRepository) {
    this.#accountsRepository = accountsRepository;
  }

  async getAll(): Promise<SolanaKeyringAccount[]> {
    return this.#accountsRepository.getAll();
  }

  async getAllSelected(): Promise<SolanaKeyringAccount[]> {
    const [allAccounts, selectedAccountIds] = await Promise.all([
      this.#accountsRepository.getAll(),
      getSelectedAccounts(snap),
    ]);

    return allAccounts.filter((account) =>
      selectedAccountIds.includes(account.id),
    );
  }

  async findById(id: string): Promise<SolanaKeyringAccount | null> {
    return this.#accountsRepository.findById(id);
  }

  /**
   * Finds multiple Solana keyring accounts.
   *
   * @param ids - Account IDs to resolve.
   * @returns The matching accounts.
   */
  async findByIds(ids: string[]): Promise<SolanaKeyringAccount[]> {
    return this.#accountsRepository.findByIds(ids);
  }

  async findByAddress(address: string): Promise<SolanaKeyringAccount | null> {
    return this.#accountsRepository.findByAddress(address);
  }

  async save(account: SolanaKeyringAccount): Promise<void> {
    return this.#accountsRepository.save(account);
  }

  async delete(id: string): Promise<void> {
    return this.#accountsRepository.delete(id);
  }
}
