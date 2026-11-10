import { runInThisContext } from 'node:vm';
import { vi } from 'vitest';

/**
 * Register a mock Snap.
 *
 * This is used to register a mock Snap for the tests.
 */
export function registerMockSnap(): void {
  const snapGlobal = globalThis as typeof globalThis & {
    snap?: { request: (...args: unknown[]) => Promise<unknown> };
  };
  snapGlobal.snap ??= {
    request: vi.fn(() => Promise.resolve(undefined)),
  };
  runInThisContext('var snap = globalThis.snap');
}
