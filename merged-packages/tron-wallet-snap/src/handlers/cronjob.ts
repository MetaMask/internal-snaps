import type { JsonRpcRequest } from '@metamask/utils';

import type { SnapClient } from '../clients/snap/SnapClient';
import type { AccountsService } from '../services/accounts/AccountsService';
import type { ILogger } from '../utils/logger';
import { createPrefixedLogger } from '../utils/logger';

export enum BackgroundEventMethod {
  ContinuouslySynchronizeAccounts = 'onContinuouslySynchronizeAccounts',
  SynchronizeAccounts = 'onSynchronizeAccounts',
  SynchronizeAccount = 'onSynchronizeAccount',
  SynchronizeAccountTransactions = 'onSynchronizeAccountTransactions',
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

    switch (method as BackgroundEventMethod) {
      case BackgroundEventMethod.ContinuouslySynchronizeAccounts:
        await this.continuouslySynchronizeAccounts();
        break;
      case BackgroundEventMethod.SynchronizeAccounts:
        await this.synchronizeAccounts();
        break;
      case BackgroundEventMethod.SynchronizeAccount:
        await this.synchronizeAccount(params as { accountId: string });
        break;
      case BackgroundEventMethod.SynchronizeAccountTransactions:
        await this.synchronizeAccountTransactions(
          params as { accountId: string },
        );
        break;
      default:
        throw new Error(`Unknown cronjob method: ${method}`);
    }
  }

  /**
   * A background job that continuosly synchronizes all accounts.
   * It schedules itself while the extension is active to make sure the data is fresh.
   */
  async continuouslySynchronizeAccounts(): Promise<void> {
    this.#logger.info('[Tick] Continuously synchronizing accounts...');

    await this.synchronizeAccounts();

    await this.#snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.ContinuouslySynchronizeAccounts,
      duration: '30s',
    });
  }

  async synchronizeAccounts(): Promise<void> {
    this.#logger.info('Synchronizing all accounts...');

    const accounts = await this.#accountsService.getAll();

    await this.#accountsService.synchronize(accounts);
  }

  async synchronizeAccount({
    accountId,
  }: {
    accountId: string;
  }): Promise<void> {
    this.#logger.info(`Synchronizing account ${accountId}...`);

    const account = await this.#accountsService.findById(accountId);

    if (!account) {
      return;
    }

    await this.#accountsService.synchronize([account]);
  }

  async synchronizeAccountTransactions({
    accountId,
  }: {
    accountId: string;
  }): Promise<void> {
    this.#logger.info(`Synchronizing account transactions ${accountId}...`);

    const account = await this.#accountsService.findById(accountId);

    if (!account) {
      return;
    }

    await this.#accountsService.synchronizeTransactions([account]);
  }
}
