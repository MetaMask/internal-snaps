import type { JsonRpcRequest } from '@metamask/utils';

import type { SnapClient } from '../clients/snap/SnapClient';
import type { AccountsService } from '../services/accounts/AccountsService';

export enum CronMethod {
  SynchronizeAccounts = 'scheduleRefreshAccounts',
}

export class CronHandler {
  readonly #accountsService: AccountsService;

  readonly #snapClient: SnapClient;

  constructor({
    accountsService,
    snapClient,
  }: {
    accountsService: AccountsService;
    snapClient: SnapClient;
  }) {
    this.#accountsService = accountsService;
    this.#snapClient = snapClient;
  }

  async handle(request: JsonRpcRequest): Promise<void> {
    const { method } = request;
    const { active } = await this.#snapClient.getClientStatus();

    if (!active) {
      return;
    }

    switch (method as CronMethod) {
      case CronMethod.SynchronizeAccounts:
        await this.synchronizeAccounts();
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
}
