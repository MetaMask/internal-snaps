import type { Json, SnapsProvider } from '@metamask/snaps-sdk';
import type { MutexInterface } from 'async-mutex';
import { Mutex } from 'async-mutex';
import { cloneDeep, unset } from 'lodash';

import { safeMerge } from '../safeMerge/safeMerge';
import { deserialize, serialize } from '../serialization/serialization';
import type { Serializable } from '../serialization/types';
import type { IStateManager } from './IStateManager';

export type StateConfig<TValue extends Record<string, Serializable>> = {
  encrypted: boolean;
  defaultState: TValue;
};

/**
 * Resolves the Snap RPC client from the global `snap` object provided by the Snap runtime.
 *
 * @returns The Snap `request` function.
 */
const getSnapRequest = (): SnapsProvider['request'] =>
  (globalThis as typeof globalThis & { snap: SnapsProvider }).snap.request;

/**
 * Because we use both snap_manageState and snap_setState, we must protect against them
 * being used at the same time. We must also protect against multiple parallel requests
 * to snap_manageState.
 *
 * Path writes (`setKey` / `setKeyWith`) are serialized with a dedicated write mutex so
 * concurrent read-modify-write updates cannot interleave. Path reads may still run in
 * parallel with each other. A blob (`snap_manageState`) operation waits for in-flight path
 * operations to finish and blocks new ones from starting until it completes.
 */
class StateLock {
  // Gate every operation must pass through to start. Path operations hold it only while
  // registering; a blob operation holds it for its whole duration, so no path operation
  // can start after a blob operation begins waiting for in-flight ones to finish.
  readonly #operationAdmissionMutex = new Mutex();

  // Held while at least one path operation is in flight.
  readonly #regularStateUpdateMutex = new Mutex();

  readonly #regularStateWriteMutex = new Mutex();

  #pendingRegularStateUpdates = 0;

  #releaseRegularStateUpdateMutex: MutexInterface.Releaser | null = null;

  async #acquireRegularStateUpdateMutex(): Promise<void> {
    if (!this.#regularStateUpdateMutex.isLocked()) {
      this.#releaseRegularStateUpdateMutex =
        await this.#regularStateUpdateMutex.acquire();
    }
  }

  async wrapRegularStateOperation<ReturnType>(
    callback: MutexInterface.Worker<ReturnType>,
  ): Promise<ReturnType> {
    await this.#operationAdmissionMutex.runExclusive(async () => {
      await this.#acquireRegularStateUpdateMutex();
      this.#pendingRegularStateUpdates += 1;
    });

    try {
      return await callback();
    } finally {
      this.#pendingRegularStateUpdates -= 1;

      if (
        this.#pendingRegularStateUpdates === 0 &&
        this.#releaseRegularStateUpdateMutex
      ) {
        this.#releaseRegularStateUpdateMutex();
      }
    }
  }

  async wrapRegularStateWriteOperation<ReturnType>(
    callback: MutexInterface.Worker<ReturnType>,
  ): Promise<ReturnType> {
    return await this.#regularStateWriteMutex.runExclusive(async () =>
      this.wrapRegularStateOperation(callback),
    );
  }

  async wrapManageStateOperation<ReturnType>(
    callback: MutexInterface.Worker<ReturnType>,
  ): Promise<ReturnType> {
    return await this.#operationAdmissionMutex.runExclusive(async () => {
      await this.#regularStateUpdateMutex.waitForUnlock();

      return await callback();
    });
  }
}

/**
 * Layer on top of `snap_manageState` / `snap_getState` / `snap_setState`:
 *
 * - Serializes values before storing them and deserializes after reading.
 * - Merges `defaultState` on full-blob reads via `safeMerge`.
 * - Serializes path writes and full-blob updates (lock strategy B).
 */
export class State<
  TStateValue extends Record<string, Serializable>,
> implements IStateManager<TStateValue> {
  readonly #lock = new StateLock();

  readonly #config: StateConfig<TStateValue>;

  constructor(config: StateConfig<TStateValue>) {
    this.#config = config;
  }

  async #unsafeGet(): Promise<TStateValue> {
    const state = await getSnapRequest()({
      method: 'snap_getState',
      params: {
        encrypted: this.#config.encrypted,
      },
    });

    const stateDeserialized = deserialize(state ?? {}) as TStateValue;

    // Clone the defaults so updaters that mutate the returned state (e.g. `deleteKey`
    // via lodash `unset`) never leak into the shared `defaultState` object.
    return safeMerge(cloneDeep(this.#config.defaultState), stateDeserialized);
  }

  async get(): Promise<TStateValue> {
    return this.#lock.wrapRegularStateOperation(async () => this.#unsafeGet());
  }

  async getKey<TResponse extends Serializable>(
    key: string,
  ): Promise<TResponse | undefined> {
    return this.#lock.wrapRegularStateOperation(async () => {
      const value = await getSnapRequest()({
        method: 'snap_getState',
        params: {
          key,
          encrypted: this.#config.encrypted,
        },
      });

      if (value === null) {
        return undefined;
      }

      return deserialize(value) as TResponse;
    });
  }

  async setKey(key: string, value: Serializable): Promise<void> {
    await this.#lock.wrapRegularStateWriteOperation(async () => {
      await getSnapRequest()({
        method: 'snap_setState',
        params: {
          key,
          value: serialize(value),
          encrypted: this.#config.encrypted,
        },
      });
    });
  }

  async setKeyWith<TValue extends Serializable>(
    key: string,
    updater: (currentValue: TValue | undefined) => TValue,
  ): Promise<void> {
    await this.#lock.wrapRegularStateWriteOperation(async () => {
      const rawValue = await getSnapRequest()({
        method: 'snap_getState',
        params: {
          key,
          encrypted: this.#config.encrypted,
        },
      });

      const oldValue =
        rawValue === null ? undefined : (deserialize(rawValue) as TValue);

      await getSnapRequest()({
        method: 'snap_setState',
        params: {
          key,
          value: serialize(updater(oldValue)),
          encrypted: this.#config.encrypted,
        },
      });
    });
  }

  async update(
    updaterFunction: (state: TStateValue) => TStateValue,
  ): Promise<TStateValue> {
    return await this.#lock.wrapManageStateOperation(async () => {
      const newState = updaterFunction(await this.#unsafeGet());

      await getSnapRequest()({
        method: 'snap_manageState',
        params: {
          operation: 'update',
          newState: serialize(newState) as Record<string, Json>,
          encrypted: this.#config.encrypted,
        },
      });

      return newState;
    });
  }

  async deleteKey(key: string): Promise<void> {
    await this.update((state) => {
      unset(state, key);
      return state;
    });
  }

  async deleteKeys(keys: string[]): Promise<void> {
    await this.update((state) => {
      keys.forEach((key) => {
        unset(state, key);
      });
      return state;
    });
  }
}
