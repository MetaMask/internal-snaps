import { getSelectedAccounts } from '@metamask/keyring-snap-sdk';
import {
  DEFAULT_METAMASK_ORIGIN,
  InFlightCoalescer,
  SynchronizationError,
  getUnreportedSyncFailures,
} from '@metamask/snap-networks-utils';
import type { IStateManager } from '@metamask/snap-networks-utils';
import type { JsonRpcRequest, SnapsProvider } from '@metamask/snaps-sdk';
import type { Describe } from 'superstruct';
import { array, assert, is, object, string } from 'superstruct';

import {
  InexistentMethodError,
  mapToTransactionType,
  TrackingSnapEvent,
} from '../entities';
import type {
  BitcoinAccount,
  Logger,
  RescanState,
  SnapClient,
  SnapState,
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

const SendFormRefreshRatesRequest = object({
  interfaceId: string(),
});

const SyncSelectedAccountsRequest = object({
  accountIds: array(string()),
});

const FullScanAccountRequest = object({
  accountId: string(),
});

const RescanStateStruct: Describe<RescanState> = object({
  pending: array(string()),
});

export class CronHandler {
  readonly #accountsUseCases: AccountUseCases;

  readonly #sendFlowUseCases: SendFlowUseCases;

  readonly #snapClient: SnapClient;

  readonly #unencryptedState: IStateManager<Partial<SnapState>>;

  readonly #snap: SnapsProvider;

  readonly #logger: Logger;

  readonly #syncCoalescer = new InFlightCoalescer();

  constructor(
    accounts: AccountUseCases,
    sendFlow: SendFlowUseCases,
    snapClient: SnapClient,
    unencryptedState: IStateManager<Partial<SnapState>>,
    snap: SnapsProvider,
    logger: Logger,
  ) {
    this.#accountsUseCases = accounts;
    this.#sendFlowUseCases = sendFlow;
    this.#snapClient = snapClient;
    this.#unencryptedState = unencryptedState;
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
      const failures = getUnreportedSyncFailures(results, accountIds);

      if (failures.length === 0) {
        return;
      }

      await this.#snapClient.emitTrackingError(
        new SynchronizationError(message, failures),
      );
    } catch (reportingError) {
      this.#logger.error('Failed to report error', { reportingError });
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
    // Keep regular synchronization and repair in one coalesced run so a later
    // synchronization cannot publish newer data before this run's repair finishes.
    await this.#syncCoalescer.run('synchronizeAccounts', async () => {
      const selectedAccounts: Set<string> = new Set(
        await getSelectedAccounts(this.#snap),
      );

      // Load only the selected wallets: each loaded wallet is deserialized into
      // WASM memory, and unselected accounts are not synchronized. The same
      // wallets are shared with the repair step below.
      let accounts: BitcoinAccount[];
      try {
        accounts = await this.#accountsUseCases.getWalletsByIds([
          ...selectedAccounts,
        ]);
      } catch (error) {
        await this.#snapClient.emitTrackingError(
          new Error('Selected account loading failed', { cause: error }),
        );
        throw error;
      }

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

      // Publish normal balance and activity updates before the slower repair scan.
      try {
        // Normal synchronization may have taken long enough for the client to lock.
        const { active, locked } = await this.#snapClient.getClientStatus();
        if (!active || locked) {
          return;
        }

        await this.#repairNextAccount(accounts);
      } catch (error) {
        await this.#snapClient.emitTrackingError(
          new Error('Account repair scan failed', { cause: error }),
        );
      }
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

    // Emit one batched balance event for all accounts
    await this.#snapClient.emitAccountBalancesUpdatedEvent(
      results.map((syncResult) => syncResult.account),
    );

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
    const result = await this.#accountsUseCases.fullScan(account);
    await this.#emitSyncEvents([result]);
  }

  /**
   * Repair one previously-unwatched account per sync run. Advances the
   * pending list only after the scan succeeds, so a scan that never runs
   * (client locked/inactive) or fails leaves the account pending for the
   * next sync run instead of being marked done prematurely.
   *
   * Only selected accounts are repaired: unselected accounts are not
   * synchronized either, and scanning them would send their addresses to the
   * indexer for no benefit. They stay pending until they are selected.
   *
   * @param accounts - The accounts already loaded by the sync run. Used to find
   * the selected pending accounts, since their IDs use the stored casing.
   */
  async #repairNextAccount(accounts: BitcoinAccount[]): Promise<void> {
    const stored = await this.#unencryptedState.getKey<RescanState>('rescanV1');
    const hasValidRescanState = is(stored, RescanStateStruct);

    if (hasValidRescanState && stored.pending.length === 0) {
      return;
    }

    // Pending IDs can belong to unselected accounts, which are not loaded here,
    // so liveness is checked against every stored account ID.
    const allAccountIds = new Set(await this.#accountsUseCases.listIds());

    const pending = hasValidRescanState
      ? stored.pending.filter((id) => allAccountIds.has(id))
      : [...allAccountIds];

    if (!hasValidRescanState || pending.length !== stored.pending.length) {
      await this.#unencryptedState.setKey('rescanV1', { pending });
    }

    const accountsById = new Map(
      accounts.map((account) => [account.id, account]),
    );
    const nextId = pending.find((id) => accountsById.has(id));
    const account = nextId === undefined ? undefined : accountsById.get(nextId);
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
          mapToTransactionType(account, tx.tx),
        );
      }
    }

    await this.#emitSyncEvents([result]);
    await this.#unencryptedState.setKey('rescanV1', {
      pending: pending.filter((id) => id !== account.id),
    });
  }
}
