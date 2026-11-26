import { hasProperty, isObject } from '@metamask/utils';

import {
  IN_MEMORY_KEY_PREFIX,
  PERSISTED_KEY_PREFIX,
  STORAGE_STATE_KEY,
} from './constants';

export type AppliedLanguage = {
  profileId: string;
  language: string;
};

type PersistedStorage = {
  version: 1;
  items: Record<string, string>;
  appliedLanguage?: AppliedLanguage;
};

const items = new Map<string, string>();

let appliedLanguage: AppliedLanguage | undefined;

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
 * Get the last language applied by the snap, if any.
 *
 * @returns The applied language entry, or `undefined`.
 */
export function getAppliedLanguage(): AppliedLanguage | undefined {
  return appliedLanguage;
}

/**
 * Record the last language applied for a profile.
 *
 * @param entry - The profile ID and ISO 639-1 language code.
 */
export function setAppliedLanguage(entry: AppliedLanguage): void {
  appliedLanguage = entry;
}

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
 * Build the persisted storage payload with items sorted by key so that the
 * serialization only changes when the content does.
 *
 * @returns The persisted storage payload.
 */
function getPersistedValue(): PersistedStorage {
  const sortedItems = Object.fromEntries(
    [...items.entries()]
      .filter(([key]) => isPersistedKey(key))
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );

  return {
    version: 1,
    items: sortedItems,
    ...(appliedLanguage ? { appliedLanguage } : {}),
  };
}

/**
 * Read the persisted items from snap state, ignoring anything that does not
 * have the expected shape.
 *
 * @param state - The value stored under {@link STORAGE_STATE_KEY}.
 * @returns The persisted storage items and applied language.
 */
function parsePersistedStorage(state: unknown): {
  items: Record<string, string>;
  appliedLanguage?: AppliedLanguage;
} {
  if (
    !isObject(state) ||
    state.version !== 1 ||
    !hasProperty(state, 'items') ||
    !isObject(state.items)
  ) {
    return { items: {} };
  }

  const persistedItems = Object.fromEntries(
    Object.entries(state.items)
      .filter(
        (entry): entry is [string, string] =>
          isPersistedKey(entry[0]) && typeof entry[1] === 'string',
      )
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );

  const rawLanguage = hasProperty(state, 'appliedLanguage')
    ? state.appliedLanguage
    : undefined;
  const parsedLanguage =
    isObject(rawLanguage) &&
    hasProperty(rawLanguage, 'profileId') &&
    hasProperty(rawLanguage, 'language') &&
    typeof rawLanguage.profileId === 'string' &&
    rawLanguage.profileId.length > 0 &&
    typeof rawLanguage.language === 'string' &&
    rawLanguage.language.length > 0
      ? { profileId: rawLanguage.profileId, language: rawLanguage.language }
      : undefined;

  return {
    items: persistedItems,
    ...(parsedLanguage ? { appliedLanguage: parsedLanguage } : {}),
  };
}

/**
 * Load the persisted items into memory from unencrypted snap state.
 */
export async function hydrateStorage(): Promise<void> {
  const state = await snap.request({
    method: 'snap_getState',
    params: { key: STORAGE_STATE_KEY, encrypted: false },
  });

  const persisted = parsePersistedStorage(state);

  items.clear();
  for (const [key, value] of Object.entries(persisted.items)) {
    items.set(key, value);
  }
  appliedLanguage = persisted.appliedLanguage;

  lastCommitted = JSON.stringify(getPersistedValue());
}

/**
 * Persist the items changed during the request. Does nothing when nothing
 * changed.
 */
export async function commitStorage(): Promise<void> {
  const value = getPersistedValue();
  const serialized = JSON.stringify(value);

  if (serialized === lastCommitted) {
    return;
  }

  await snap.request({
    method: 'snap_setState',
    params: { key: STORAGE_STATE_KEY, value, encrypted: false },
  });
  lastCommitted = serialized;
}

/**
 * Forget the in-memory items and commit baseline.
 */
export function resetStorage(): void {
  items.clear();
  appliedLanguage = undefined;
  lastCommitted = null;
}
