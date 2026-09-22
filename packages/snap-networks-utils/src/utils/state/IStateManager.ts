import type { Serializable } from '../serialization/types';

export type IStateManager<TStateValue extends Record<string, Serializable>> = {
  /**
   * Gets the whole state object.
   *
   * ⚠️ WARNING: Use with caution because it transfers the whole state, which might contain a lot of data.
   * If you need to retrieve only a specific part of the state, use IStateManager.getKey instead.
   */
  get(): Promise<TStateValue>;
  /**
   * Gets the value of the passed key in the state object.
   * The key is the JSON path to the value to get.
   *
   * @returns The value of the key, or undefined if the key does not exist.
   */
  getKey<TResponse extends Serializable>(
    key: string,
  ): Promise<TResponse | undefined>;
  /**
   * Sets the value of the passed key in the state object.
   * The key is a JSON path to the value to set.
   *
   * @param key - The key to set, which is a JSON path to the location.
   * @param value - The value to set.
   */
  setKey(key: string, value: Serializable): Promise<void>;
  /**
   * Atomically reads the current value at `key`, applies `updater`, and writes the result back.
   *
   * Implementations must ensure that no concurrent state write can interleave between the
   * read and the write. This makes the method safe for updates where the next value depends
   * on the current value, such as merging objects.
   *
   * Prefer this over a manual `getKey` + `setKey` sequence whenever the new value depends on
   * the current one.
   *
   * @param key - The JSON-path key to update.
   * @param updater - Receives the current value (or `undefined` when the key is absent) and
   * returns the new value to store.
   */
  setKeyWith<TValue extends Serializable>(
    key: string,
    updater: (currentValue: TValue | undefined) => TValue,
  ): Promise<void>;
  /**
   * Updates the whole state object.
   *
   * Typically used for bulk `set`s or `delete`s, because:
   * - Atomicity: Using a single `state.update` ensures that all changes are applied atomically.
   * - Performance: One round trip instead of many `setKey` / `deleteKey` calls.
   * - State Consistency: Read once, modify in memory, write the complete updated state back.
   *
   * ⚠️ WARNING: Use with caution because:
   * - it will override the whole state.
   * - it transfers the whole state back and forth to the data store.
   *
   * For single updates, use `setKey` or `deleteKey` instead.
   *
   * @param updaterFunction - The function that updates the state.
   * @returns The updated state.
   */
  update(
    updaterFunction: (state: TStateValue) => TStateValue,
  ): Promise<TStateValue>;
  /**
   * Deletes the value of the passed key in the state object.
   * The key is a JSON path to the value to delete.
   */
  deleteKey(key: string): Promise<void>;
  /**
   * Deletes multiple keys in the state object in a single operation.
   * The keys are JSON paths to the values to delete.
   */
  deleteKeys(keys: string[]): Promise<void>;
};
