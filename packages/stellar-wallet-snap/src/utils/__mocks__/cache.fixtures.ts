import type { ICache, Serializable } from '@metamask/snap-networks-utils';

/**
 * In-memory {@link ICache} for tests (vi.fn wrappers + backing map).
 *
 * @returns Cache implementation and backing map for priming reads.
 */
export function createMemoryCache(): {
  cache: ICache<Serializable>;
  store: Map<string, Serializable>;
} {
  const store = new Map<string, Serializable>();
  const cache: ICache<Serializable> = {
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, value: Serializable) => {
      store.set(key, value);
    }),
    delete: vi.fn(async () => false),
    clear: vi.fn(async () => {
      store.clear();
    }),
    has: vi.fn(async () => false),
    keys: vi.fn(async () => [...store.keys()]),
    size: vi.fn(async () => store.size),
    peek: vi.fn(async (key: string) => store.get(key)),
    mget: vi.fn(async (keys: string[]) => {
      const result: Record<string, Serializable | undefined> = {};
      for (const key of keys) {
        result[key] = store.get(key);
      }
      return result;
    }),
    mset: vi.fn(
      async (
        entries: {
          key: string;
          value: Serializable;
          ttlMilliseconds?: number;
        }[],
      ) => {
        for (const { key, value } of entries) {
          if (value !== undefined) {
            store.set(key, value);
          }
        }
      },
    ),
    mdelete: vi.fn(async () => ({})),
  };
  return { cache, store };
}
