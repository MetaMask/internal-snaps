import { getSelectedAccounts } from '@metamask/keyring-snap-sdk';
import { InFlightCoalescer } from '@metamask/snap-networks-utils';
import type { Json, JsonRpcRequest, SnapsProvider } from '@metamask/snaps-sdk';
import { array, assert, is, object, string } from 'superstruct';

import {
  InexistentMethodError,
  SynchronizationError,
  TrackingSnapEvent,
} from '../entities';
import type { BitcoinAccount, SnapClient, SyncResult } from '../entities';
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

const RescanState = object({
  pending: array(string()),
});

export class CronHandler {
  readonly #accountsUseCases: AccountUseCases;

  readonly #sendFlowUseCases: SendFlowUseCases;

  readonly #snapClient: SnapClient;

  readonly #snap: SnapsProvider;

  readonly #syncCoalescer = new InFlightCoalescer();

  constructor(
    accounts: AccountUseCases,
    sendFlow: SendFlowUseCases,
    snapClient: SnapClient,
    snap: SnapsProvider,
  ) {
    this.#accountsUseCases = accounts;
    this.#sendFlowUseCases = sendFlow;
    this.#snapClient = snapClient;
    this.#snap = snap;
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
    // that coalesced callers share the run's outcome, including a
    // `SynchronizationError` from partial failures.
    await this.#syncCoalescer.run('synchronizeAccounts', async () => {
      try {
        await this.#repairNextAccount();
      } catch (error) {
        await this.#snapClient.emitTrackingError(
          new SynchronizationError(
            'Account repair scan failed',
            undefined,
            error,
          ),
        );
      }

      const selectedAccounts: Set<string> = new Set(
        await getSelectedAccounts(this.#snap),
      );

      const accounts = (await this.#accountsUseCases.list()).filter(
        (account) => {
          return selectedAccounts.has(account.id);
        },
      );

      const results = await Promise.allSettled(
        accounts.map(async (account) =>
          this.#accountsUseCases.synchronize(account, 'cron'),
        ),
      );

      await this.#finishSync(
        accounts,
        results,
        'Account synchronization failures',
      );
    });
  }

  /**
   * Aggregate settled sync results, emit events for successes, and throw for failures.
   *
   * @param accounts - The accounts that were synchronized, in the same order as `results`.
   * @param results - The settled synchronization results.
   * @param message - The error message to use if any synchronization failed.
   */
  async #finishSync(
    accounts: BitcoinAccount[],
    results: PromiseSettledResult<SyncResult>[],
    message: string,
  ): Promise<void> {
    const successfulResults: SyncResult[] = [];
    const errors: Record<string, Json> = {};

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successfulResults.push(result.value);
      } else {
        const id = accounts[index]?.id;
        if (id) {
          errors[id] = String(result.reason);
        }
      }
    });

    await this.#emitSyncEvents(successfulResults);

    if (Object.keys(errors).length > 0) {
      throw new SynchronizationError(message, errors);
    }
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
          this.#accountsUseCases.synchronize(account, 'metamask'),
        ),
      );

      const successfulResults = results
        .filter(
          (result): result is PromiseFulfilledResult<SyncResult> =>
            result.status === 'fulfilled',
        )
        .map((result) => result.value);

      const rejectedResults = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );

      if (rejectedResults.length > 0) {
        await this.#snapClient.emitTrackingError(
          new SynchronizationError(
            `Failed to synchronize ${rejectedResults.length} selected accounts`,
            undefined,
            rejectedResults[0]?.reason,
          ),
        );
      }

      await this.#emitSyncEvents(successfulResults);
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

    // Emit one batched balance event for all accounts
    await this.#snapClient.emitAccountBalancesUpdatedEvent(
      results.map((syncResult) => syncResult.account),
    );

    // Emit transaction events per account
    for (const { account, transactionsToNotify } of results) {
      if (transactionsToNotify.length > 0) {
        await this.#snapClient.emitAccountTransactionsUpdatedEvent(
          account,
          transactionsToNotify,
        );
      }
    }
  }

  async fullScanAccount(accountId: string): Promise<void> {
    const account = await this.#accountsUseCases.get(accountId);
    const result = await this.#accountsUseCases.fullScan(account);
    await this.#emitSyncEvents([result]);
  }

  /**
   * Repair one previously-unwatched account per sync run. Advances the
   * pending list only after the scan succeeds, so a scan that never runs
   * (client locked/inactive) or fails leaves the account pending for the
   * next sync run instead of being marked done prematurely.
   */
  async #repairNextAccount(): Promise<void> {
    const stored = await this.#snapClient.getState('rescanV1');
    if (is(stored, RescanState) && stored.pending.length === 0) {
      return;
    }

    const accounts = await this.#accountsUseCases.list();
    const liveIds = new Set(accounts.map((account) => account.id));

    const pending = is(stored, RescanState)
      ? stored.pending.filter((id) => liveIds.has(id))
      : accounts.map((account) => account.id);

    if (!is(stored, RescanState) || pending.length !== stored.pending.length) {
      await this.#snapClient.setState('rescanV1', { pending });
    }

    const account = accounts.find(({ id }) => id === pending[0]);
    if (!account) {
      return;
    }

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
        );
      }
    }

    await this.#emitSyncEvents([result]);
    await this.#snapClient.setState('rescanV1', { pending: pending.slice(1) });
  }
}
