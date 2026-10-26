import { is, number, object, record, string } from 'superstruct';

import type { SnapClient } from '../entities';

/**
 * State key of the failing-sync streaks per account.
 */
export const SYNC_HEALTH_KEY = 'syncHealthV1';

/**
 * How long an account's synchronization may keep failing after its last
 * successful sync before its stored balance is no longer reported as current
 * (`getAccountBalances` throws `BalanceStaleError`). Three missed 30 s syncs,
 * matching the client's 90 s re-check of a balance it has not seen confirmed.
 */
export const BALANCE_STALE_AFTER_MS = 90_000;

const SyncHealthState = record(string(), object({ staleSince: number() }));

/**
 * Tracks, per account, whether its synchronization is failing and since when
 * its stored balance has not been confirmed, to tell a stale balance from a
 * current one.
 *
 * A failure streak is persisted (only on transitions: its first failure and
 * the success that ends it), because the snap may be restarted between two
 * syncs and an in-memory streak would restart with it, never reaching
 * {@link BALANCE_STALE_AFTER_MS}. `staleSince` is the last successful sync
 * seen by this snap instance, or the streak's first failure when none was.
 */
export class SyncHealthStore {
  readonly #snapClient: SnapClient;

  readonly #now: () => number;

  /** Last successful sync per account, for this snap instance. */
  readonly #lastSuccessAt = new Map<string, number>();

  #streaks: Record<string, { staleSince: number }> | undefined;

  #tail: Promise<unknown> = Promise.resolve();

  constructor(snapClient: SnapClient, now: () => number = Date.now) {
    this.#snapClient = snapClient;
    this.#now = now;
  }

  async #serialize<Result>(task: () => Promise<Result>): Promise<Result> {
    const run = this.#tail.then(task, task);
    this.#tail = run.catch(() => undefined);
    return run;
  }

  async #load(): Promise<Record<string, { staleSince: number }>> {
    if (this.#streaks === undefined) {
      const stored = await this.#snapClient.getState(SYNC_HEALTH_KEY);
      this.#streaks = is(stored, SyncHealthState) ? { ...stored } : {};
    }
    return this.#streaks;
  }

  /**
   * Records a successful sync (or full scan): ends the account's failure
   * streak, if any.
   *
   * @param accountId - The account ID.
   */
  async recordSuccess(accountId: string): Promise<void> {
    this.#lastSuccessAt.set(accountId, this.#now());
    await this.#serialize(async () => {
      const streaks = await this.#load();
      if (streaks[accountId] === undefined) {
        return;
      }
      delete streaks[accountId];
      await this.#snapClient.setState(SYNC_HEALTH_KEY, { ...streaks });
    });
  }

  /**
   * Records a failed sync (or full scan): starts the account's failure streak
   * if none is in progress.
   *
   * @param accountId - The account ID.
   */
  async recordFailure(accountId: string): Promise<void> {
    await this.#serialize(async () => {
      const streaks = await this.#load();
      if (streaks[accountId] !== undefined) {
        return;
      }
      streaks[accountId] = {
        staleSince: this.#lastSuccessAt.get(accountId) ?? this.#now(),
      };
      await this.#snapClient.setState(SYNC_HEALTH_KEY, { ...streaks });
    });
  }

  /**
   * Whether the account's stored balance may be outdated: its syncs have been
   * failing, unconfirmed for at least {@link BALANCE_STALE_AFTER_MS}. An
   * account that has not been synced yet, or whose latest sync succeeded, is
   * not stale.
   *
   * @param accountId - The account ID.
   * @returns `true` if the balance must not be reported as current.
   */
  async isStale(accountId: string): Promise<boolean> {
    const streak = await this.#serialize(async () => {
      const streaks = await this.#load();
      return streaks[accountId];
    });
    return (
      streak !== undefined &&
      this.#now() - streak.staleSince >= BALANCE_STALE_AFTER_MS
    );
  }

  /**
   * Forgets an account (deleted).
   *
   * @param accountId - The account ID.
   */
  async forget(accountId: string): Promise<void> {
    this.#lastSuccessAt.delete(accountId);
    await this.#serialize(async () => {
      const streaks = await this.#load();
      if (streaks[accountId] === undefined) {
        return;
      }
      delete streaks[accountId];
      await this.#snapClient.setState(SYNC_HEALTH_KEY, { ...streaks });
    });
  }
}
