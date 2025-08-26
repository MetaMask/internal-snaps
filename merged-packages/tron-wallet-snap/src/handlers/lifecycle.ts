import { CronMethod } from './cronjob';
import type { SnapClient } from '../clients/snap/SnapClient';
import type { AccountsService } from '../services/accounts/AccountsService';
import type { ILogger } from '../utils/logger';
import { createPrefixedLogger } from '../utils/logger';

export class LifecycleHandler {
  readonly #logger: ILogger;

  readonly #accountsService: AccountsService;

  readonly #snapClient: SnapClient;

  constructor({
    logger,
    accountsService,
    snapClient,
  }: {
    logger: ILogger;
    accountsService: AccountsService;
    snapClient: SnapClient;
  }) {
    this.#logger = createPrefixedLogger(logger, '[👵 LifecycleHandler]');
    this.#accountsService = accountsService;
    this.#snapClient = snapClient;
  }

  /**
   * Called when the extension is made active.
   */
  async onActive(): Promise<void> {
    this.#logger.log('[🔋 onActive]');

    const accounts = await this.#accountsService.getAll();
    await this.#accountsService.synchronize(accounts);

    await this.#snapClient.scheduleBackgroundEvent({
      method: CronMethod.SynchronizeAccounts,
      duration: '10s',
    });
  }
}
