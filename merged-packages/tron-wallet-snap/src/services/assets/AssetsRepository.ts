import type { AssetEntity } from '../../entities/assets';
import type { State, UnencryptedStateValue } from '../state/State';

export class AssetsRepository {
  readonly #storageKey = 'assets';

  readonly #state: State<UnencryptedStateValue>;

  constructor(state: State<UnencryptedStateValue>) {
    this.#state = state;
  }

  async getByAccountId(accountId: string): Promise<AssetEntity[]> {
    return (
      (await this.#state.getKey<AssetEntity[]>(
        `${this.#storageKey}.${accountId}`,
      )) ?? []
    );
  }

  async saveMany(assets: AssetEntity[]): Promise<void> {
    return this.#state.setKey(this.#storageKey, {
      ...(await this.getAll()),
      ...assets,
    });
  }

  async getAll(): Promise<AssetEntity[]> {
    return (await this.#state.getKey<AssetEntity[]>(this.#storageKey)) ?? [];
  }
}
