import type { SnapsProvider } from '@metamask/snaps-sdk';

/**
 * Returns the Snap provider injected by the Snap runtime.
 *
 * @returns The Snap provider.
 */
export function getSnapProvider(): SnapsProvider {
  return (globalThis as typeof globalThis & { snap: SnapsProvider }).snap;
}
