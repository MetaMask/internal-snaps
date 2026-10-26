import { getSelectedAccounts } from '@metamask/keyring-snap-sdk';
import {
  DEFAULT_METAMASK_ORIGIN,
  InFlightCoalescer,
  SynchronizationError,
  getSyncFailuresFromSettledResult,
} from '@metamask/snap-networks-utils';
import type { JsonRpcRequest, SnapsProvider } from '@metamask/snaps-sdk';
import { array, assert, object, string } from 'superstruct';

import {
  InexistentMethodError,
  mapToTransactionType,
  TrackingSnapEvent,
} from '../entities';
import type {
  BitcoinAccount,
  Logger,
  SnapClient,
  SyncResult,
} from '../entities';
import type { SendFlowUseCases, AccountUseCases } from '../use-cases';

export const CronMethod = {
  SynchronizeAccounts: 'synchronizeAccounts',
  RefreshRates: 'refreshRates',
  SyncSelectedAccounts: 'syncSelectedAccounts',
  FullScanAccount: 'fullScanAccount',
} as const;

export type CronMethod = (typeof CronMethod)[keyof typeof CronMethod];

export const SendFormRefreshRatesRequest = object({
  interfaceId: string(),
});

export const SyncSelectedAccountsRequest = object({
  accountIds: array(string()),
});

export const FullScanAccountRequest = object({
  accountId: string(),
});

/**
 * Maximum number of queued full scans run per sync run.
 */
export const MAX_FULL_SCANS_PER_RUN = 2;

export class CronHandler {
  readonly #accountsUseCases: AccountUseCases;

  readonly #sendFlowUseCases: SendFlowUseCases;

  readonly #snapClient: SnapClient;

  readonly #snap: SnapsProvider;

  readonly #logger: Logger;

  readonly #syncCoalescer = new InFlightCoalescer();

  constructor(
    accounts: AccountUseCases,
    sendFlow: SendFlowUseCases,
    snapClient: SnapClient,
    snap: SnapsProvider,
    logger: Logger,
  ) {
    this.#accountsUseCases = accounts;
    this.#sendFlowUseCases = sendFlow;
    this.#snapClient = snapClient;
    this.#snap = snap;
    this.#logger = logger;
  }

  /**
   * Reports account synchronization failures to Sentry, with the failure
   * reasons embedded in the message: error tracking (`snap_trackError`) does
   * not preserve custom error properties, so the message is the only reliable
   * channel for the details.
   *
   * Reporting never throws: tracking failures are logged and swallowed, so
   * they never break the caller's flow.
   *
   * @param message - The error message describing the failed operation.
   * @param results - The settled synchronization results.
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

      await this.#snapClient.emitTrackingError(
        new SynchronizationError(message, failures),
      );
    } catch (reportingError) {
      this.#logger.warn('Failed to report error', { reportingError });
    }
  }

  async route(request: JsonRpcRequest): Promise<void> {
    const { method, params } = request;

    const { active, locked } = await this.#snapClient.getClientStatus();
    if (!active || locked) {
      return undefined;
    }

    switch (method as CronMethod) {
      case CronMethod.SynchronizeAccounts: {
        return this.synchronizeAccounts();
      }
      case CronMethod.RefreshRates: {
        assert(params, SendFormRefreshRatesRequest);
        return this.#sendFlowUseCases.refresh(params.interfaceId);
      }
      case CronMethod.SyncSelectedAccounts: {
        assert(params, SyncSelectedAccountsRequest);
        return this.syncSelectedAccounts(params.accountIds);
      }
      case CronMethod.FullScanAccount: {
        assert(params, FullScanAccountRequest);
        return this.fullScanAccount(params.accountId);
      }
      default:
        throw new InexistentMethodError(`Method not found: ${method}`);
    }
  }

  async synchronizeAccounts(): Promise<void> {
    // Sync triggers stack up (the 30s cronjob, `onActive`, background
    // events), so concurrent invocations share one in-flight run instead of
    // duplicating network fetches, state writes, and keyring events. Note
    // that coalesced callers share the run's outcome, including the reported
    // synchronization failures.
    await this.#syncCoalescer.run('synchronizeAccounts', async () => {
      const allAccounts = await this.#accountsUseCases.list();

      try {
        await this.#runDueFullScans(allAccounts);
      } catch (error) {
        await this.#snapClient.emitTrackingError(
          new Error('Account repair scan failed', { cause: error }),
        );
      }

      const selectedAccounts: Set<string> = new Set(
        await getSelectedAccounts(this.#snap),
      );

      const accounts = allAccounts.filter((account) => {
        return selectedAccounts.has(account.id);
      });

      const results = await Promise.allSettled(
        accounts.map(async (account) =>
          this.#accountsUseCases.synchronize(account, 'cron'),
        ),
      );

      await this.#finishSync(results);

      await this.#reportSyncFailures(
        'synchronizeAccounts: Account synchronization failures',
        results,
        accounts.map(({ id }) => id),
      );
    });
  }

  /**
   * Aggregates settled sync results and emits events for the successful ones.
   *
   * @param results - The settled synchronization results.
   */
  async #finishSync(
    results: PromiseSettledResult<SyncResult>[],
  ): Promise<void> {
    const successfulResults: SyncResult[] = [];

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        successfulResults.push(result.value);
      }
    });

    await this.#emitSyncEvents(successfulResults);
  }

  async syncSelectedAccounts(accountIds: string[]): Promise<void> {
    // Every `setSelectedAccounts` call schedules a background event with no
    // dedupe, so bursts of identical syncs fire together during onboarding
    // and imports. Concurrent invocations for the same account set share one
    // in-flight run.
    const uniqueAccountIds = [...new Set(accountIds)].sort();
    const key = `syncSelectedAccounts:${JSON.stringify(uniqueAccountIds)}`;

    await this.#syncCoalescer.run(key, async () => {
      const accountIdSet = new Set(uniqueAccountIds);
      const allAccounts = await this.#accountsUseCases.list();

      const selectedAccounts = allAccounts.filter((account) =>
        accountIdSet.has(account.id),
      );

      const results = await Promise.allSettled(
        selectedAccounts.map(async (account) =>
          this.#accountsUseCases.synchronize(account, DEFAULT_METAMASK_ORIGIN),
        ),
      );

      const successfulResults = results
        .filter(
          (result): result is PromiseFulfilledResult<SyncResult> =>
            result.status === 'fulfilled',
        )
        .map((result) => result.value);

      await this.#emitSyncEvents(successfulResults);

      await this.#reportSyncFailures(
        'syncSelectedAccounts: Account synchronization failures',
        results,
        selectedAccounts.map(({ id }) => id),
      );
    });
  }

  /**
   * Emit batched balance and transaction events for sync results.
   *
   * @param results - The successful sync results.
   */
  async #emitSyncEvents(results: SyncResult[]): Promise<void> {
    if (results.length === 0) {
      return;
    }

    // Emit one batched balance event for the accounts whose balance is
    // known. A sync of an account whose first full scan has not succeeded
    // only covers its revealed addresses: pushing that partial balance would
    // show a confident (possibly zero) amount, so it is held back until the
    // full scan succeeds.
    const knownBalanceAccounts: BitcoinAccount[] = [];
    for (const { account } of results) {
      if (!(await this.#accountsUseCases.isBalanceUnknown(account))) {
        knownBalanceAccounts.push(account);
      }
    }
    if (knownBalanceAccounts.length > 0) {
      await this.#snapClient.emitAccountBalancesUpdatedEvent(
        knownBalanceAccounts,
      );
    }

    // Emit transaction events per account
    for (const {
      account,
      transactionsToNotify,
      transactionSenders,
    } of results) {
      if (transactionsToNotify.length > 0) {
        await this.#snapClient.emitAccountTransactionsUpdatedEvent(
          account,
          transactionsToNotify,
          ...(transactionSenders ? [transactionSenders] : []),
        );
      }
    }
  }

  async fullScanAccount(accountId: string): Promise<void> {
    const account = await this.#accountsUseCases.get(accountId);
    // On-demand scans (new account, balance request, network recovery) can
    // be requested more than once; skip the ones whose purpose was already
    // fulfilled by another scan in the meantime.
    if (
      !this.#accountsUseCases.isFullScanInFlight(accountId) &&
      !(await this.#accountsUseCases.isBalanceUnknown(account))
    ) {
      this.#logger.debug('Full scan no longer needed: %s', accountId);
      return;
    }
    const result = await this.#accountsUseCases.fullScan(account);
    await this.#emitSyncEvents([result]);
  }

  /**
   * Runs the full scans that are due: the first full scan of new accounts,
   * of accounts that never synchronized, and the one-off repair scan of
   * previously-unwatched accounts.
   *
   * @param accounts - All live accounts.
   *
   * Up to {@link MAX_FULL_SCANS_PER_RUN} accounts are scanned concurrently per
   * sync run. A failed scan moves the account to the tail of the queue and
   * backs it off exponentially (see `FullScanQueue`), so a single failing
   * account can no longer block every account queued behind it.
   */
  async #runDueFullScans(accounts: BitcoinAccount[]): Promise<void> {
    const due = await this.#accountsUseCases.listDueFullScans(
      accounts,
      MAX_FULL_SCANS_PER_RUN,
    );
    if (due.length === 0) {
      return;
    }

    const results = await Promise.allSettled(
      due.map(async (account) => {
        const before = new Set(
          account.listTransactions().map((tx) => tx.txid.toString()),
        );
        const result = await this.#accountsUseCases.fullScan(account);

        for (const tx of account.listTransactions()) {
          if (!before.has(tx.txid.toString())) {
            await this.#snapClient.emitTrackingEvent(
              TrackingSnapEvent.MissedTransactionsDiscovered,
              account,
              tx,
              'cron',
              mapToTransactionType(account, tx.tx),
            );
          }
        }
        return result;
      }),
    );

    await this.#finishSync(results);

    const firstFailure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (firstFailure) {
      throw firstFailure.reason;
    }
  }
}
