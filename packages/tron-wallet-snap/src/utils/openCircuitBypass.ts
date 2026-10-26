import { BrokenCircuitError } from '@metamask/snap-networks-utils';

/**
 * Minimum time between two requests that skip the open circuit of a fetch
 * policy for the same upstream request (see {@link OpenCircuitBypass}).
 */
export const OPEN_CIRCUIT_BYPASS_INTERVAL_MS = 10_000;

/**
 * How long the result of a successful direct (bypassing) request is reused for
 * the same upstream request. A balance refresh makes two keyring calls in a
 * row (`keyring_listAccountAssets`, then `keyring_getAccountBalances`) that
 * read the same endpoints; both must see the result of the one direct request.
 */
export const OPEN_CIRCUIT_BYPASS_RESULT_TTL_MS = 5_000;

/**
 * The message of cockatiel's `BrokenCircuitError` (and its subclasses), thrown
 * by the fetch policy when it short-circuits a call while its circuit is open.
 * The keyring SDK rethrows non-snap errors as `new Error(message)`, dropping
 * the class and the cause, so the message is the only marker left by the time
 * the error reaches the snap's error handler.
 */
export const OPEN_CIRCUIT_ERROR_MESSAGE =
  'Execution prevented because the circuit breaker is open';

/**
 * Options of a read made on behalf of an explicit client request.
 */
export type ExplicitRequestOptions = {
  /**
   * The request was explicitly made by the client (a `listAccountAssets` or
   * `getAccountBalances` keyring call, such as the balance Retry): it may reach
   * the network once while the fetch policy's circuit is open, instead of
   * failing without a request until the circuit half-opens.
   */
  bypassOpenCircuit?: boolean;
};

/**
 * The parts of a fetch policy (`createFetchPolicy`) the bypass uses. Optional,
 * so a bare `{ execute }` policy (tests) still works.
 */
export type BypassablePolicy = {
  getRemainingCircuitOpenDuration?: () => number | null;
  reset?: () => void;
};

/**
 * Whether a single error (not its cause chain) is an open-circuit error.
 *
 * Checked by class, by cockatiel's `isBrokenCircuitError` flag, by name, and by
 * message, because the class identity does not survive every boundary (the
 * keyring SDK rethrows a plain `Error` with the same message; bundling can
 * duplicate the class).
 *
 * @param error - The error.
 * @returns `true` if the error is an open-circuit error.
 */
function isOwnOpenCircuitError(error: unknown): boolean {
  if (error instanceof BrokenCircuitError) {
    return true;
  }
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { isBrokenCircuitError, name, message } = error as {
    isBrokenCircuitError?: unknown;
    name?: unknown;
    message?: unknown;
  };
  return (
    isBrokenCircuitError === true ||
    name === 'BrokenCircuitError' ||
    name === 'IsolatedCircuitError' ||
    (typeof message === 'string' &&
      message.includes(OPEN_CIRCUIT_ERROR_MESSAGE))
  );
}

/**
 * Whether an error, or any error in its `cause` chain, is the fetch policy's
 * open-circuit short-circuit (no request was made).
 *
 * @param error - The error to check.
 * @returns `true` if the error comes from an open circuit.
 */
export function isOpenCircuitError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 10 && current !== undefined; depth++) {
    if (isOwnOpenCircuitError(current)) {
      return true;
    }
    current =
      typeof current === 'object' && current !== null
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return false;
}

/**
 * Whether the policy's circuit is open (calls fail without a request).
 *
 * @param policy - The fetch policy.
 * @returns `true` if the circuit is open.
 */
export function isCircuitOpen(policy: BypassablePolicy | undefined): boolean {
  const remaining = policy?.getRemainingCircuitOpenDuration?.();
  return typeof remaining === 'number' && remaining > 0;
}

/**
 * Lets an explicit client request reach the network while a fetch policy's
 * circuit is open.
 *
 * The circuit opens after repeated failures and then fails every call without
 * a request for 30 seconds, so a user-initiated retry made meanwhile could
 * never succeed. With this gate, such a request makes one direct attempt (no
 * retries, not counted by the policy) when the circuit is open: either known
 * up front from the policy's state, or detected from the guarded call's
 * open-circuit error. Concurrent identical requests share the attempt, a
 * successful attempt is reused for {@link OPEN_CIRCUIT_BYPASS_RESULT_TTL_MS}
 * and closes the circuit (the service answered), and each upstream request
 * bypasses the circuit at most once per {@link OPEN_CIRCUIT_BYPASS_INTERVAL_MS},
 * so polling cannot hammer a failing service; background reads never bypass
 * it.
 */
export class OpenCircuitBypass {
  readonly #intervalMs: number;

  readonly #resultTtlMs: number;

  readonly #lastAttemptAt = new Map<string, number>();

  readonly #lastResult = new Map<string, { at: number; value: unknown }>();

  readonly #inFlight = new Map<string, Promise<unknown>>();

  constructor(
    intervalMs: number = OPEN_CIRCUIT_BYPASS_INTERVAL_MS,
    resultTtlMs: number = OPEN_CIRCUIT_BYPASS_RESULT_TTL_MS,
  ) {
    this.#intervalMs = intervalMs;
    this.#resultTtlMs = resultTtlMs;
  }

  /**
   * Runs the guarded read, and the direct one if allowed when the circuit is
   * open.
   *
   * @param key - Identifies the upstream request (network, method, URL, body).
   * @param options - The request options.
   * @param guarded - The read under the fetch policy.
   * @param direct - The same read, once, without the policy.
   * @param policy - The fetch policy guarding the read, used to check whether
   * its circuit is open before the call and to close it after a successful
   * direct read.
   * @returns The read result.
   */
  async run<Result>(
    key: string,
    options: ExplicitRequestOptions | undefined,
    guarded: () => Promise<Result>,
    direct: () => Promise<Result>,
    policy?: BypassablePolicy,
  ): Promise<Result> {
    if (!options?.bypassOpenCircuit) {
      return guarded();
    }

    const now = Date.now();
    const lastResult = this.#lastResult.get(key);
    if (lastResult && now - lastResult.at < this.#resultTtlMs) {
      return lastResult.value as Result;
    }

    const inFlight = this.#inFlight.get(key);
    if (inFlight) {
      return (await inFlight) as Result;
    }

    let openCircuitError: unknown = new BrokenCircuitError();
    if (!isCircuitOpen(policy)) {
      try {
        return await guarded();
      } catch (error) {
        if (!isOpenCircuitError(error)) {
          throw error;
        }
        openCircuitError = error;
      }
    }

    return this.#runDirect(key, direct, openCircuitError, policy);
  }

  async #runDirect<Result>(
    key: string,
    direct: () => Promise<Result>,
    openCircuitError: unknown,
    policy: BypassablePolicy | undefined,
  ): Promise<Result> {
    const inFlight = this.#inFlight.get(key);
    if (inFlight) {
      return (await inFlight) as Result;
    }

    const now = Date.now();
    const lastAttemptAt = this.#lastAttemptAt.get(key);
    if (lastAttemptAt !== undefined && now - lastAttemptAt < this.#intervalMs) {
      throw openCircuitError;
    }
    for (const [otherKey, otherAt] of this.#lastAttemptAt) {
      if (now - otherAt >= this.#intervalMs) {
        this.#lastAttemptAt.delete(otherKey);
      }
    }
    for (const [otherKey, { at }] of this.#lastResult) {
      if (now - at >= this.#resultTtlMs) {
        this.#lastResult.delete(otherKey);
      }
    }
    this.#lastAttemptAt.set(key, now);

    const attempt = (async (): Promise<Result> => {
      const value = await direct();
      this.#lastResult.set(key, { at: Date.now(), value });
      // The service answered: close the circuit so background reads resume
      // now instead of after the next half-open probe.
      policy?.reset?.();
      return value;
    })().finally(() => {
      this.#inFlight.delete(key);
    });
    this.#inFlight.set(key, attempt);
    return await attempt;
  }
}
