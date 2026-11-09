/**
 * The message of the error thrown when an account's on-chain info cannot be
 * fetched (see `SnapAssetsAdapter.fetchAssetsAndBalancesForAccount`). Every
 * balance refresh of a client (`listAccountAssets`, `getAccountBalances`,
 * revalidation every 15 s, the user's Retry) fails with it while TronGrid is
 * unreachable, so it is reported once per failure streak instead of once per
 * call.
 */
export const ACCOUNT_INFO_FETCH_FAILED_MESSAGE = 'Failed to fetch account info';

/**
 * While a failure streak lasts, it is reported again at most this often, so a
 * long outage still shows up in Sentry as ongoing.
 */
export const FAILURE_STREAK_REMINDER_MS = 15 * 60_000;

/**
 * Reports a repeated failure once per streak: the first failure is reported,
 * the following ones are not until the streak ends (a success for the same
 * key) or {@link FAILURE_STREAK_REMINDER_MS} has passed since the last report.
 *
 * Keyed by message, not by account: the error reaching the snap's error
 * handler from a keyring call is rethrown by the keyring SDK as a plain
 * `Error(message)` without its cause or the account, and an upstream outage
 * fails every account at once, so one event per outage carries the signal.
 */
export class FailureStreakGate {
  readonly #reminderMs: number;

  readonly #reportedAt = new Map<string, number>();

  constructor(reminderMs: number = FAILURE_STREAK_REMINDER_MS) {
    this.#reminderMs = reminderMs;
  }

  /**
   * Whether a failure should be reported, recording the report if so.
   *
   * @param key - The failure key (the error message).
   * @returns `true` for the first failure of a streak or a due reminder.
   */
  shouldReport(key: string): boolean {
    const now = Date.now();
    const reportedAt = this.#reportedAt.get(key);
    if (reportedAt !== undefined && now - reportedAt < this.#reminderMs) {
      return false;
    }
    this.#reportedAt.set(key, now);
    return true;
  }

  /**
   * Ends the failure streak of a key (the operation succeeded): its next
   * failure is reported.
   *
   * @param key - The failure key.
   */
  endStreak(key: string): void {
    this.#reportedAt.delete(key);
  }

  /**
   * Forgets every streak.
   */
  clear(): void {
    this.#reportedAt.clear();
  }
}

/**
 * Failures reported once per streak (see {@link FailureStreakGate}).
 */
export const STREAK_GATED_FAILURE_MESSAGES: readonly string[] = [
  ACCOUNT_INFO_FETCH_FAILED_MESSAGE,
];

/**
 * The snap-wide gate used by `shouldTrack`.
 */
export const failureStreakGate = new FailureStreakGate();

/**
 * The streak-gated message of an error, if any.
 *
 * @param error - The error.
 * @returns The gated message, or `undefined`.
 */
export function getStreakGatedMessage(error: unknown): string | undefined {
  const message =
    typeof error === 'object' && error !== null
      ? (error as { message?: unknown }).message
      : undefined;
  return typeof message === 'string' &&
    STREAK_GATED_FAILURE_MESSAGES.includes(message)
    ? message
    : undefined;
}
