import { hasProperty, isObject } from '@metamask/utils';

import {
  IN_MEMORY_KEY_PREFIX,
  MAX_PERSISTED_STORAGE_SIZE,
  PERSISTED_KEY_PREFIX,
  SNAP_KEY_PREFIX,
  STORAGE_STATE_KEY,
} from './constants';

type PersistedStorage = {
  version: 1;
  items: Record<string, string>;
};

/**
 * Thrown when the SDK storage grows past the persisted size limit. The
 * storage has been wiped when this is thrown.
 */
export class StorageLimitError extends Error {
  readonly size: number;

  constructor(size: number) {
    super(
      `Braze storage reached ${size} units, above the ${MAX_PERSISTED_STORAGE_SIZE} limit. It has been wiped.`,
    );
    this.name = 'StorageLimitError';
    this.size = size;
  }
}

const items = new Map<string, string>();

const snapItems = new Map<string, string>();

let hydrated = false;

let lastCommitted: string | null = null;

/**
 * The `localStorage` the SDK sees. Reads and writes only touch memory; the
 * snap persists the result once per request with {@link commitStorage}.
 */
export const storageShim = {
  get length(): number {
    return items.size;
  },

  key(index: number): string | null {
    return [...items.keys()][index] ?? null;
  },

  getItem(key: string): string | null {
    return items.get(String(key)) ?? null;
  },

  setItem(key: string, value: string): void {
    items.set(String(key), String(value));
  },

  removeItem(key: string): void {
    items.delete(String(key));
  },

  clear(): void {
    items.clear();
  },
};

/**
 * The snap's own items, persisted with the SDK storage.
 */
export const snapStorage = {
  getItem(key: string): string | null {
    return snapItems.get(key) ?? null;
  },

  setItem(key: string, value: string): void {
    snapItems.set(key, value);
  },
};

/**
 * Check whether an SDK storage key is persisted.
 *
 * @param key - The key.
 * @returns Whether the key is persisted.
 */
function isPersistedKey(key: string): boolean {
  return (
    key.startsWith(PERSISTED_KEY_PREFIX) &&
    !key.startsWith(IN_MEMORY_KEY_PREFIX)
  );
}

/**
 * Remove the items of the SDK and of the snap from memory.
 */
function clearItems(): void {
  items.clear();
  snapItems.clear();
}

/**
 * Get the items that should be persisted, sorted by key so that the
 * serialization only changes when the content does.
 *
 * @returns The persistable items.
 */
function getPersistableItems(): Record<string, string> {
  return Object.fromEntries(
    [
      ...[...items.entries()].filter(([key]) => isPersistedKey(key)),
      ...[...snapItems.entries()].map(([key, value]): [string, string] => [
        `${SNAP_KEY_PREFIX}${key}`,
        value,
      ]),
    ].sort(([a], [b]) => (a < b ? -1 : 1)),
  );
}

/**
 * Read the persisted items from snap state, ignoring anything that does not
 * have the expected shape.
 *
 * @param state - The value stored under {@link STORAGE_STATE_KEY}.
 * @returns The persisted items.
 */
function parsePersistedStorage(state: unknown): Record<string, string> {
  if (
    !isObject(state) ||
    state.version !== 1 ||
    !hasProperty(state, 'items') ||
    !isObject(state.items)
  ) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(state.items).filter(
      (entry): entry is [string, string] =>
        (isPersistedKey(entry[0]) || entry[0].startsWith(SNAP_KEY_PREFIX)) &&
        typeof entry[1] === 'string',
    ),
  );
}

/**
 * Write the persisted items to snap state.
 *
 * @param persistedItems - The items to persist.
 */
async function writeStorage(
  persistedItems: Record<string, string>,
): Promise<void> {
  const value: PersistedStorage = { version: 1, items: persistedItems };
  await snap.request({
    method: 'snap_setState',
    params: { key: STORAGE_STATE_KEY, value, encrypted: false },
  });
}

/**
 * Load the persisted items into memory. Only reads snap state the first time
 * it is called while the snap is running.
 */
export async function hydrateStorage(): Promise<void> {
  if (hydrated) {
    return;
  }

  const state = await snap.request({
    method: 'snap_getState',
    params: { key: STORAGE_STATE_KEY, encrypted: false },
  });

  const persistedItems = parsePersistedStorage(state);

  clearItems();
  for (const [key, value] of Object.entries(persistedItems)) {
    if (key.startsWith(SNAP_KEY_PREFIX)) {
      snapItems.set(key.slice(SNAP_KEY_PREFIX.length), value);
    } else {
      items.set(key, value);
    }
  }

  lastCommitted = JSON.stringify(persistedItems);
  hydrated = true;
}

/**
 * Persist the items the SDK changed during the request. Does nothing when
 * nothing changed. Wipes the storage instead when it is above the size limit.
 *
 * @throws {StorageLimitError} If the storage was above the size limit.
 */
export async function commitStorage(): Promise<void> {
  const persistedItems = getPersistableItems();
  const serialized = JSON.stringify(persistedItems);

  if (serialized === lastCommitted) {
    return;
  }

  if (serialized.length > MAX_PERSISTED_STORAGE_SIZE) {
    clearItems();
    await writeStorage({});
    lastCommitted = JSON.stringify({});
    throw new StorageLimitError(serialized.length);
  }

  await writeStorage(persistedItems);
  lastCommitted = serialized;
}

/**
 * Forget the in-memory items, so that the next {@link hydrateStorage} reads
 * snap state again.
 */
export function resetStorage(): void {
  clearItems();
  hydrated = false;
  lastCommitted = null;
}
