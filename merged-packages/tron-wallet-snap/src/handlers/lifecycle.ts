import { BackgroundEventMethod } from './cronjob';
import type { SnapClient } from '../clients/snap/SnapClient';
import type { ILogger } from '../utils/logger';
import { createPrefixedLogger } from '../utils/logger';

export class LifecycleHandler {
  readonly #logger: ILogger;

  readonly #snapClient: SnapClient;

  constructor({
    logger,
    snapClient,
  }: {
    logger: ILogger;
    snapClient: SnapClient;
  }) {
    this.#logger = createPrefixedLogger(logger, '[👵 LifecycleHandler]');
    this.#snapClient = snapClient;
  }

  /**
   * Called when the extension is made active.
   */
  async onActive(): Promise<void> {
    this.#logger.log('[🔋 onActive]');

    await this.#snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.ContinuouslySynchronizeSelectedAccounts,
      duration: 'PT1S',
    });
  }
}
