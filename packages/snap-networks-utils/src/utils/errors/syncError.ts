/**
 * A single account synchronization failure, with enough context to understand
 * which account failed and why.
 */
export type AccountSyncFailure = {
  /** The ID of the account that failed to synchronize. */
  accountId: string;
  /** The failure reason, as a human-readable string. */
  reason: string;
};

/**
 * Maximum number of characters kept from each failure reason. Reasons can be
 * arbitrarily long (e.g. full network error messages), so they are truncated
 * to keep the error message readable in Sentry.
 */
const MAX_REASON_LENGTH = 300;

/**
 * Maximum number of failures listed in the error message. When more accounts
 * fail, the remaining ones are summarized with a `+N more` suffix.
 */
const MAX_LISTED_FAILURES = 10;

/**
 * Formats account synchronization failures as a compact, single-line summary.
 *
 * The summary is intended to be embedded in the error message of a
 * `SynchronizationError`: error tracking via `snap_trackError` serializes only
 * the error's `name`, `message`, `stack`, and `cause`, so any details stored in
 * other properties (e.g. a `data` field) are lost before reaching Sentry.
 *
 * @param failures - The account synchronization failures to format.
 * @returns A single-line summary of the failures, truncated to keep the
 * message readable.
 */
export function formatAccountSyncFailures(
  failures: AccountSyncFailure[],
): string {
  const listed = failures.slice(0, MAX_LISTED_FAILURES);
  const details = listed.map((failure) => {
    const reason =
      failure.reason.length > MAX_REASON_LENGTH
        ? `${failure.reason.slice(0, MAX_REASON_LENGTH)}…`
        : failure.reason;

    return `${failure.accountId}: ${reason}`;
  });

  const remaining = failures.length - listed.length;
  const suffix = remaining > 0 ? `; +${remaining} more` : '';

  return `${details.join('; ')}${suffix}`;
}

/**
 * Error thrown when one or more accounts fail to synchronize.
 *
 * The failure details are embedded in the message (not only in a property) so
 * that they survive error tracking: `snap_trackError` serializes only the
 * error's `name`, `message`, `stack`, and `cause`.
 */
export class SynchronizationError extends Error {
  /**
   * The structured list of account synchronization failures. Useful for logs;
   * note that it is not preserved by error tracking.
   */
  readonly failures: AccountSyncFailure[];

  /**
   * Construct a new synchronization error.
   *
   * @param message - The error message, e.g. `'Account synchronization failures'`.
   * @param failures - The per-account failures to append to the message.
   * @param options - Additional error options.
   * @param options.cause - The underlying error that caused the synchronization failure, if any.
   */
  constructor(
    message: string,
    failures: AccountSyncFailure[] = [],
    options?: { cause?: unknown },
  ) {
    const details =
      failures.length > 0
        ? ` (${failures.length} failed): ${formatAccountSyncFailures(failures)}`
        : '';

    super(`${message}${details}`, options);
    this.name = 'SynchronizationError';
    this.failures = failures;
  }
}
