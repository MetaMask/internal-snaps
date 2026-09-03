import type { SnapsProvider } from '@metamask/snaps-sdk';

/**
 * Returns the Snap provider.
 *
 * @returns The Snap provider.
 */
export function getSnapProvider(): SnapsProvider {
  // snap is a global variable provided by the Snap SDK
  return snap;
}
