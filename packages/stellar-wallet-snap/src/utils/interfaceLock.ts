import { Mutex } from 'async-mutex';

const interfaceLocks = new Map<string, Mutex>();

/**
 * Runs work exclusively for one interface.
 *
 * @param id - The interface ID.
 * @param callback - The work to perform while holding the lock.
 * @returns The callback result.
 */
export async function withInterfaceLock<TResult>(
  id: string,
  callback: () => Promise<TResult>,
): Promise<TResult> {
  const mutex = interfaceLocks.get(id) ?? new Mutex();
  interfaceLocks.set(id, mutex);
  try {
    return await mutex.runExclusive(callback);
  } finally {
    if (!mutex.isLocked() && interfaceLocks.get(id) === mutex) {
      interfaceLocks.delete(id);
    }
  }
}
