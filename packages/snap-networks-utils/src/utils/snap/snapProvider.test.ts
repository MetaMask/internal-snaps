import type { SnapsProvider } from '@metamask/snaps-sdk';

import { getSnapProvider } from './snapProvider';

describe('getSnapProvider', () => {
  const previousSnap = (
    globalThis as typeof globalThis & { snap?: SnapsProvider }
  ).snap;

  afterEach(() => {
    const snapGlobal = globalThis as typeof globalThis & {
      snap?: SnapsProvider;
    };

    if (previousSnap === undefined) {
      delete snapGlobal.snap;
    } else {
      snapGlobal.snap = previousSnap;
    }
  });

  it('returns the Snap provider from globalThis', () => {
    const snap = {
      request: vi.fn(async () => undefined),
    } as unknown as SnapsProvider;

    (globalThis as typeof globalThis & { snap: SnapsProvider }).snap = snap;

    expect(getSnapProvider()).toBe(snap);
  });
});
