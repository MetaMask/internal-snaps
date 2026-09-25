/**
 * Stringifies a rejection reason without ever throwing: `String(reason)`
 * throws when the reason has a hostile `toString`/`Symbol.toPrimitive`. If the
 * reason is an error with a `cause`, the cause is appended, so the wrapped
 * failure (e.g. the underlying network error) is part of the reported reason.
 *
 * Intended for building human-readable failure reasons (e.g. for
 * `AccountSyncFailure.reason`), where wrapper errors would otherwise hide the
 * original failure behind a generic message.
 *
 * @param reason - The rejection reason to stringify.
 * @returns The reason as a string, or a placeholder when stringification fails.
 */
export function stringifyReason(reason: unknown): string {
  try {
    if (!(reason instanceof Error)) {
      return String(reason);
    }

    const message = String(reason);
    const { cause } = reason;

    if (cause === null || cause === undefined) {
      return message;
    }

    // Deliberately permissive: any cause detail is worth reporting, and a
    // pathological value still ends up as the placeholder via the outer catch.
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return `${message} (${String(cause)})`;
  } catch {
    return 'Unknown error';
  }
}
