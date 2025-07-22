import type { Transaction } from '@metamask/keyring-api';

import type { TronKeyringAccount } from '../../entities';
import type { ILogger } from '../../utils/logger';
import type { State, UnencryptedStateValue } from '../state/State';

export class TransactionsService {
  readonly #logger: ILogger;

  readonly #loggerPrefix = '[💸 TransactionsService]';

  readonly #state: State<UnencryptedStateValue>;

  constructor({
    logger,
    state,
  }: {
    logger: ILogger;
    state: State<UnencryptedStateValue>;
  }) {
    this.#logger = logger;
    this.#state = state;
  }

  async listTransactions(account: TronKeyringAccount): Promise<Transaction[]> {
    return []; // TODO: Implement me
  }
}
