import { getSelectedAccounts } from '@metamask/keyring-snap-sdk';
import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';

import type { AccountsRepository } from './AccountsRepository';

export class AccountsService {
  readonly #accountsRepository: AccountsRepository;

  constructor(accountsRepository: AccountsRepository) {
    this.#accountsRepository = accountsRepository;
  }

  async getAll(): Promise<ExtendedKeyringAccount[]> {
    return this.#accountsRepository.getAll();
  }

  async getAllSelected(): Promise<ExtendedKeyringAccount[]> {
    const [allAccounts, selectedAccountIds] = await Promise.all([
      this.#accountsRepository.getAll(),
      getSelectedAccounts(snap),
    ]);

    return allAccounts.filter((account) =>
      selectedAccountIds.includes(account.id),
    );
  }

  async findById(id: string): Promise<ExtendedKeyringAccount | null> {
    return this.#accountsRepository.findById(id);
  }

  /**
   * Finds multiple Solana keyring accounts.
   *
   * @param ids - Account IDs to resolve.
   * @returns The matching accounts.
   */
  async findByIds(ids: string[]): Promise<ExtendedKeyringAccount[]> {
    return this.#accountsRepository.findByIds(ids);
  }

  async findByAddress(address: string): Promise<ExtendedKeyringAccount | null> {
    return this.#accountsRepository.findByAddress(address);
  }

  async save(account: ExtendedKeyringAccount): Promise<void> {
    return this.#accountsRepository.save(account);
  }

  async delete(id: string): Promise<void> {
    return this.#accountsRepository.delete(id);
  }
}
