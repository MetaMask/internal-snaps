import { get, set, unset } from 'lodash';

import type { Serializable } from '../serialization/types';
import type { IStateManager } from './IStateManager';

/**
 * A simple implementation of the `IStateManager` interface that relies on an in-memory
 * state. Intended for tests.
 */
export class InMemoryState<
  TStateValue extends Record<string, Serializable>,
> implements IStateManager<TStateValue> {
  #state: TStateValue;

  constructor(initialState: TStateValue) {
    this.#state = initialState;
  }

  async get(): Promise<TStateValue> {
    return this.#state;
  }

  async getKey<TResponse extends Serializable>(
    key: string,
  ): Promise<TResponse | undefined> {
    return get(this.#state, key) as TResponse | undefined;
  }

  async setKey(key: string, value: Serializable): Promise<void> {
    set(this.#state, key, value);
  }

  async setKeyWith<TValue extends Serializable>(
    key: string,
    updater: (currentValue: TValue | undefined) => TValue,
  ): Promise<void> {
    const oldValue = get(this.#state, key) as TValue | undefined;
    set(this.#state, key, updater(oldValue));
  }

  async update(
    callback: (state: TStateValue) => TStateValue,
  ): Promise<TStateValue> {
    this.#state = callback(this.#state);
    return this.#state;
  }

  async deleteKey(key: string): Promise<void> {
    unset(this.#state, key);
  }

  async deleteKeys(keys: string[]): Promise<void> {
    keys.forEach((key) => {
      unset(this.#state, key);
    });
  }
}