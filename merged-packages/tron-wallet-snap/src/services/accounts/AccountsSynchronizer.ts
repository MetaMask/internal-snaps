import type { AccountsService } from './AccountsService';
import type { TronKeyringAccount } from '../../entities';
import { createPrefixedLogger, type ILogger } from '../../utils/logger';

export class AccountsSynchronizer {
  readonly #accountsService: AccountsService;

  readonly #logger: ILogger;

  constructor(accountsService: AccountsService, logger: ILogger) {
    this.#accountsService = accountsService;
    this.#logger = createPrefixedLogger(logger, '[🔄 AccountsSynchronizer]');
  }

  async synchronize(accounts?: TronKeyringAccount[]): Promise<void> {
    const accountsToSync = accounts ?? (await this.#accountsService.getAll());

    this.#logger.info('Synchronizing accounts', accountsToSync);

    await this.#accountsService.synchronize(accountsToSync);
  }
}
