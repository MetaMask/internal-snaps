/**
 * Coalesces concurrent async operations by key: while a call for a key is in
 * flight, subsequent calls with the same key await the same promise instead of
 * starting duplicate work. Once a run settles, the next call starts a fresh one.
 *
 * Note that coalesced callers share the run's outcome, including rejections.
 */
export class InFlightCoalescer {
  readonly #inFlight = new Map<string, Promise<unknown>>();

  async run<Result>(key: string, fn: () => Promise<Result>): Promise<Result> {
    const pending = this.#inFlight.get(key);
    if (pending) {
      return pending as Promise<Result>;
    }

    const task = Promise.resolve()
      .then(fn)
      .finally(() => {
        this.#inFlight.delete(key);
      });
    this.#inFlight.set(key, task);

    return task;
  }
}
