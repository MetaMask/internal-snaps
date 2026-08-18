import type { Logger } from '@metamask/snap-networks-utils/logger';

import type { EventEmitter } from '../../../infrastructure/event-emitter';
import type { AccountsService } from '../accounts/AccountsService';
import type { KeyringAccountMonitor } from './KeyringAccountMonitor';

/**
 * Initializes the monitored accounts by monitoring the selected accounts when the snap becomes active.
 * This service is autonomous (doesn't need to be called by anyone). It listens to the 'onActive' event and handles it.
 */
export class MonitoredAccountsInitializer {
  readonly #accountsService: AccountsService;

  readonly #keyringAccountMonitor: KeyringAccountMonitor;

  readonly #eventEmitter: EventEmitter;

  readonly #logger: Logger;

  constructor(
    accountsService: AccountsService,
    keyringAccountMonitor: KeyringAccountMonitor,
    eventEmitter: EventEmitter,
    logger: Logger,
  ) {
    this.#accountsService = accountsService;
    this.#keyringAccountMonitor = keyringAccountMonitor;
    this.#eventEmitter = eventEmitter;
    this.#logger = logger.withPrefix('[🥾 MonitoredAccountsInitializer]');

    this.#bindHandlers();
  }

  #bindHandlers(): void {
    this.#eventEmitter.on('onActive', this.#monitorSelectedAccounts.bind(this));
  }

  async #monitorSelectedAccounts(): Promise<void> {
    this.#logger.info('Starting to monitor the selected accounts');

    const selectedAccounts = await this.#accountsService.getAllSelected();

    await this.#keyringAccountMonitor.setMonitoredAccounts(
      selectedAccounts.map((account) => account.id),
    );
  }
}
