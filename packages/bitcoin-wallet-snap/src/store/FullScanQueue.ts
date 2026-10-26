import type { Json } from '@metamask/utils';
import {
  array,
  boolean,
  is,
  number,
  object,
  optional,
  record,
  string,
} from 'superstruct';

import type { SnapClient } from '../entities';

/**
 * State key of the full-scan queue. The name predates this class: it was the
 * one-off "repair previously-unwatched accounts" list, whose shape
 * (`{ pending: string[] }`) is kept so existing installs continue where they
 * left off.
 */
export const FULL_SCAN_QUEUE_KEY = 'rescanV1';

/**
 * State key of the per-account retry metadata of the full-scan queue.
 */
export const FULL_SCAN_RETRY_KEY = 'fullScanRetryV1';

/** First retry delay after a failed full scan. */
export const FULL_SCAN_RETRY_BASE_MS = 30_000;

/**
 * Upper bound of the full scan retry delay. Kept short: an account whose
 * first scan failed has an unknown balance until a scan succeeds, so after
 * an outage it must be retried within minutes (on-demand scans triggered by
 * balance requests and successful syncs usually recover it sooner).
 */
export const FULL_SCAN_RETRY_MAX_MS = 5 * 60_000;

const QueueState = object({
  pending: array(string()),
});

const RetryEntryStruct = object({
  attempts: number(),
  nextAttemptAt: number(),
  initial: optional(boolean()),
  lastError: optional(string()),
});

const RetryState = record(string(), RetryEntryStruct);

export type FullScanRetryEntry = {
  attempts: number;
  nextAttemptAt: number;
  /**
   * Whether the account has never completed a full scan since it was created
   * (as opposed to a legacy account queued for a repair scan). Its balance is
   * unknown, not zero, until the scan succeeds.
   */
  initial?: boolean;
  lastError?: string;
};

/**
 * Computes the delay before the next full scan attempt.
 *
 * @param attempts - Number of failed attempts so far (>= 1).
 * @returns The delay in milliseconds.
 */
export function getFullScanRetryDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(
    FULL_SCAN_RETRY_BASE_MS * 2 ** Math.min(exponent, 16),
    FULL_SCAN_RETRY_MAX_MS,
  );
}

/**
 * Persistent queue of accounts that still need a full scan.
 *
 * - Accounts are processed in queue order, skipping those whose backoff has
 * not elapsed, so one failing account never blocks the others (no
 * head-of-line blocking).
 * - A failed account is moved to the tail and retried with exponential
 * backoff ({@link getFullScanRetryDelayMs}).
 * - When the queue state does not exist yet, every existing account is
 * queued (the original `rescanV1` repair behaviour).
 *
 * All operations are serialized so concurrent keyring requests and cron runs
 * don't overwrite each other's state.
 */
export class FullScanQueue {
  readonly #snapClient: SnapClient;

  readonly #now: () => number;

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

  async #readPending(): Promise<string[] | null> {
    const stored = await this.#snapClient.getState(FULL_SCAN_QUEUE_KEY);
    return is(stored, QueueState) ? stored.pending : null;
  }

  async #readRetry(): Promise<Record<string, FullScanRetryEntry>> {
    const stored = await this.#snapClient.getState(FULL_SCAN_RETRY_KEY);
    return is(stored, RetryState) ? { ...stored } : {};
  }

  async #write(
    pending: string[],
    retry?: Record<string, FullScanRetryEntry>,
  ): Promise<void> {
    await this.#snapClient.setState(FULL_SCAN_QUEUE_KEY, { pending });
    if (retry) {
      await this.#snapClient.setState(
        FULL_SCAN_RETRY_KEY,
        retry as unknown as Json,
      );
    }
  }

  /**
   * Queues newly created accounts for their first full scan.
   *
   * @param accountIds - The new account IDs.
   */
  async enqueueInitial(accountIds: string[]): Promise<void> {
    if (accountIds.length === 0) {
      return;
    }
    await this.#serialize(async () => {
      const pending = await this.#readPending();
      const retry = await this.#readRetry();
      const now = this.#now();
      for (const id of accountIds) {
        if (pending && !pending.includes(id)) {
          pending.push(id);
        }
        retry[id] = { attempts: 0, nextAttemptAt: now, initial: true };
      }
      if (pending) {
        await this.#write(pending, retry);
      } else {
        // The queue doesn't exist yet: `due()` will initialize it with every
        // live account, these included.
        await this.#snapClient.setState(
          FULL_SCAN_RETRY_KEY,
          retry as unknown as Json,
        );
      }
    });
  }

  /**
   * Queues accounts that never synchronized with the chain (e.g. created
   * before this queue existed, whose first scan failed and was never
   * retried). Accounts already queued keep their position and backoff.
   * They are flagged as `initial`: their balance is unknown until the scan
   * succeeds.
   *
   * @param accountIds - IDs of the never-synchronized accounts.
   * @returns The IDs that were newly queued.
   */
  async ensureQueued(accountIds: string[]): Promise<string[]> {
    if (accountIds.length === 0) {
      return [];
    }
    return this.#serialize(async () => {
      const pending = (await this.#readPending()) ?? [];
      const retry = await this.#readRetry();
      const now = this.#now();
      const added: string[] = [];
      let retryChanged = false;
      for (const id of accountIds) {
        if (!pending.includes(id)) {
          pending.push(id);
          added.push(id);
        }
        if (!retry[id]) {
          retry[id] = { attempts: 0, nextAttemptAt: now, initial: true };
          retryChanged = true;
        } else if (!retry[id].initial) {
          retry[id] = { ...retry[id], initial: true };
          retryChanged = true;
        }
      }
      if (added.length > 0 || retryChanged) {
        await this.#write(pending, retryChanged ? retry : undefined);
      }
      return added;
    });
  }

  /**
   * @param accountId - The account ID.
   * @returns Whether the account never completed its first full scan.
   */
  async isInitialScanPending(accountId: string): Promise<boolean> {
    const retry = await this.#readRetry();
    return retry[accountId]?.initial === true;
  }

  /**
   * Returns the queued accounts that are due for a scan, pruning accounts
   * that no longer exist. Initializes the queue with every live account when
   * it doesn't exist yet.
   *
   * @param liveAccountIds - IDs of the accounts that currently exist.
   * @param max - Maximum number of accounts to return.
   * @returns The due account IDs, in queue order.
   */
  async due(liveAccountIds: string[], max: number): Promise<string[]> {
    return this.#serialize(async () => {
      const live = new Set(liveAccountIds);
      const stored = await this.#readPending();
      const pending = stored
        ? stored.filter((id) => live.has(id))
        : [...liveAccountIds];
      const retry = await this.#readRetry();
      const retryIds = Object.keys(retry);
      const staleRetry = retryIds.filter((id) => !live.has(id));
      for (const id of staleRetry) {
        delete retry[id];
      }
      if (pending.length !== stored?.length || staleRetry.length > 0) {
        await this.#write(pending, staleRetry.length > 0 ? retry : undefined);
      }

      const now = this.#now();
      return pending
        .filter((id) => (retry[id]?.nextAttemptAt ?? 0) <= now)
        .slice(0, max);
    });
  }

  /**
   * Removes an account from the queue after a successful full scan.
   *
   * @param accountId - The account ID.
   */
  async markSucceeded(accountId: string): Promise<void> {
    await this.#serialize(async () => {
      const pending = await this.#readPending();
      const retry = await this.#readRetry();
      const hadRetry = Object.hasOwn(retry, accountId);
      delete retry[accountId];
      if (pending === null) {
        if (hadRetry) {
          await this.#snapClient.setState(
            FULL_SCAN_RETRY_KEY,
            retry as unknown as Json,
          );
        }
        return;
      }
      await this.#write(
        pending.filter((id) => id !== accountId),
        hadRetry ? retry : undefined,
      );
    });
  }

  /**
   * Records a failed full scan: moves the account to the tail of the queue
   * and schedules its next attempt with exponential backoff.
   *
   * @param accountId - The account ID.
   * @param error - The failure.
   */
  async markFailed(accountId: string, error: unknown): Promise<void> {
    await this.#serialize(async () => {
      const pending = (await this.#readPending()) ?? [];
      const retry = await this.#readRetry();
      const previous = retry[accountId];
      const attempts = (previous?.attempts ?? 0) + 1;
      const entry: FullScanRetryEntry = {
        attempts,
        nextAttemptAt: this.#now() + getFullScanRetryDelayMs(attempts),
        lastError: error instanceof Error ? error.message : String(error),
      };
      if (previous?.initial) {
        entry.initial = true;
      }
      retry[accountId] = entry;
      await this.#write(
        [...pending.filter((id) => id !== accountId), accountId],
        retry,
      );
    });
  }
}
