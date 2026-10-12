import type { Transaction } from '@metamask/keyring-api';
import {
  InFlightCoalescer,
  SynchronizationError,
  getSyncFailuresFromSettledResult,
} from '@metamask/snap-networks-utils';
import type {
  ExtendedKeyringAccount,
  Logger,
} from '@metamask/snap-networks-utils';

import { trackError } from '../../utils/errors';
import type { AssetsService } from '../assets/AssetsService';
import type { TransactionsService } from '../transactions';
import type { AccountsService } from './AccountsService';

export class AccountsSynchronizer {
  readonly #accountsService: AccountsService;

  readonly #assetsService: AssetsService;

  readonly #transactionsService: TransactionsService;

  readonly #logger: Logger;

  readonly #coalescer = new InFlightCoalescer();

  constructor(
    accountsService: AccountsService,
    assetsService: AssetsService,
    transactionsService: TransactionsService,
    logger: Logger,
  ) {
    this.#accountsService = accountsService;
    this.#assetsService = assetsService;
    this.#transactionsService = transactionsService;
    this.#logger = logger.withPrefix('[🔄 AccountsSynchronizer]');
  }

  async synchronize(accounts?: ExtendedKeyringAccount[]): Promise<void> {
    const accountsToSync = accounts ?? (await this.#accountsService.getAll());
    const key = [...accountsToSync.map((a) => a.id)]
      .sort((a, b) => a.localeCompare(b))
      .join(',');

    return this.#coalescer.run(key, async () => {
      this.#logger.info('Synchronizing accounts', accountsToSync);

      const responses = await Promise.allSettled(
        accountsToSync.map(async (account) =>
          this.#assetsService.fetchAccountAssets(account),
        ),
      );

      const assets = responses.flatMap((item) =>
        item.status === 'fulfilled' ? item.value : [],
      );

      await this.#reportSyncFailures(
        'Account synchronization failures',
        responses,
        accountsToSync.map(({ id }) => id),
      );

      try {
        await this.#assetsService.saveMany(assets);
      } catch (error) {
        // Save failures are batch-level (not attributable to one account), so
        // they are tracked standalone. The error is rethrown to preserve the
        // original behavior.
        await trackError(new Error('Failed to save assets', { cause: error }));

        throw error;
      }

      let transactions: Transaction[];
      try {
        transactions = await this.#transactionsService.fetchAssetsTransactions(
          assets,
          { limit: 20 },
        );
      } catch (error) {
        // Fetch failures are batch-level (not attributable to one account), so
        // they are tracked standalone.
        await trackError(
          new Error('Failed to fetch transactions', { cause: error }),
        );

        throw error;
      }

      try {
        await this.#transactionsService.saveMany(transactions);
      } catch (error) {
        // Save failures are batch-level (not attributable to one account), so
        // they are tracked standalone.
        await trackError(
          new Error('Failed to save transactions', { cause: error }),
        );

        throw error;
      }
    });
  }

  /**
   * Reports account synchronization failures to Sentry, with the failure
   * reasons embedded in the message: error tracking (`snap_trackError`) does
   * not preserve custom error properties, so the message is the only reliable
   * channel for the details.
   *
   * @param message - The message to include in the error report.
   * @param results - The settled fetch results.
   * @param accountIds - The account IDs, in the same order as `results`.
   */
  async #reportSyncFailures(
    message: string,
    results: PromiseSettledResult<unknown>[],
    accountIds: string[],
  ): Promise<void> {
    try {
      const failures = getSyncFailuresFromSettledResult(results, accountIds);

      if (failures.length === 0) {
        return;
      }

      const error = new SynchronizationError(message, failures);

      await trackError(error);
    } catch (reportingError) {
      this.#logger.warn('Failed to report synchronization failures', {
        reportingError,
      });
    }
  }
}
