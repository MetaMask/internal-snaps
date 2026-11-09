import type { SnapsProvider } from '@metamask/snaps-sdk';

const actual = await vi.importActual<typeof import('../snap')>('../snap');

(globalThis as any).snap = {
  request: vi.fn(),
};

export const getSnapProvider = (): SnapsProvider => snap;

export const getBip32Entropy = vi.fn();

export const listEntropySources = vi.fn();

export const getDefaultEntropySource = vi.fn();

export const {
  createInterface,
  showDialog,
  getPreferences,
  resolveInterface,
  scheduleBackgroundEvent,
  cancelBackgroundEvent,
  cancelBackgroundEventIfExists,
  Duration,
} = actual;
