import { getSelectedAccounts } from '@metamask/keyring-snap-sdk';
import type { Json, JsonRpcRequest, SnapsProvider } from '@metamask/snaps-sdk';
import { array, assert, boolean, object, optional, string } from 'superstruct';

import { InexistentMethodError, SynchronizationError } from '../entities';
import type { BitcoinAccount, SnapClient, SyncResult } from '../entities';
import { TrackingSnapEvent } from '../entities';
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
  trackMissed: optional(boolean()),
});

export class CronHandler {
  readonly #accountsUseCases: AccountUseCases;

  readonly #sendFlowUseCases: SendFlowUseCases;

  readonly #snapClient: SnapClient;

  readonly #snap: SnapsProvider;

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
        return this.fullScanAccount(params.accountId, params.trackMissed);
      }
      default:
        throw new InexistentMethodError(`Method not found: ${method}`);
    }
  }

  async synchronizeAccounts(): Promise<void> {
    if ((await this.#snapClient.getState('rescanV1')) !== true) {
      const allAccounts = await this.#accountsUseCases.list();
      for (const account of allAccounts) {
        await this.#snapClient.scheduleBackgroundEvent({
          duration: 'PT5S',
          method: CronMethod.FullScanAccount,
          params: { accountId: account.id, trackMissed: true },
        });
      }
      await this.#snapClient.setState('rescanV1', true);
    }

    const selectedAccounts: Set<string> = new Set(
      await getSelectedAccounts(this.#snap),
    );

    const accounts = (await this.#accountsUseCases.list()).filter((account) => {
      return selectedAccounts.has(account.id);
    });

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
    const accountIdSet = new Set(accountIds);
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
      (result): result is PromiseRejectedResult => result.status === 'rejected',
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

  async fullScanAccount(
    accountId: string,
    trackMissed?: boolean,
  ): Promise<void> {
    const account = await this.#accountsUseCases.get(accountId);

    const before = trackMissed
      ? new Set(account.listTransactions().map((tx) => tx.txid.toString()))
      : undefined;

    const result = await this.#accountsUseCases.fullScan(account);

    if (before) {
      for (const tx of account.listTransactions()) {
        if (!before.has(tx.txid.toString())) {
          await this.#snapClient.emitTrackingEvent(
            TrackingSnapEvent.ScanDiscoveredMissedTransactions,
            account,
            tx,
            'cron',
          );
        }
      }
    }

    await this.#emitSyncEvents([result]);
  }
}
