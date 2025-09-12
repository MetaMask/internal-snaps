import type { JsonRpcRequest } from '@metamask/utils';

import type { SnapClient } from '../clients/snap/SnapClient';
import type { AccountsService } from '../services/accounts/AccountsService';
import type { ILogger } from '../utils/logger';
import { createPrefixedLogger } from '../utils/logger';

export enum CronMethod {
  SynchronizeAccounts = 'scheduleRefreshAccounts',
}

export enum BackgroundEventMethod {
  SyncAccountTransactions = 'onSyncAccountTransactions',
}

export class CronHandler {
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
    this.#logger = createPrefixedLogger(logger, '[⏰ CronHandler]');
    this.#accountsService = accountsService;
    this.#snapClient = snapClient;
  }

  async handle(request: JsonRpcRequest): Promise<void> {
    const { method, params } = request;
    const { active } = await this.#snapClient.getClientStatus();

    if (!active) {
      return;
    }

    switch (method as CronMethod | BackgroundEventMethod) {
      case CronMethod.SynchronizeAccounts:
        await this.synchronizeAccounts();
        break;
      case BackgroundEventMethod.SyncAccountTransactions:
        await this.synchronizeAccountTransactions(
          (params as { accountId: string })?.accountId,
        );
        break;
      default:
        throw new Error(`Unknown cronjob method: ${method}`);
    }
  }

  /**
   * Synchronizes all accounts (assets and transactions).
   * This can be called by cron jobs to keep data fresh.
   */
  async synchronizeAccounts(): Promise<void> {
    this.#logger.info('Synchronizing accounts...');

    const { active } = await this.#snapClient.getClientStatus();

    if (!active) {
      return;
    }

    const accounts = await this.#accountsService.getAll();
    await this.#accountsService.synchronize(accounts);

    await this.#snapClient.scheduleBackgroundEvent({
      method: CronMethod.SynchronizeAccounts,
      duration: '30s',
    });
  }

  async synchronizeAccountTransactions(accountId: string): Promise<void> {
    this.#logger.info(`Synchronizing transactions for account ${accountId}...`);

    const account = await this.#accountsService.findById(accountId);

    if (!account) {
      return;
    }

    await this.#accountsService.synchronizeTransactions([account]);
  }
}
