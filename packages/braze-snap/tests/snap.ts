import type { Json } from '@metamask/utils';
import type { Mock } from 'vitest';

type StateParams = { key: string; value?: Json; encrypted?: boolean };

export type SnapStub = {
  state: Map<string, Json>;
  request: Mock<
    (args: { method: string; params: StateParams }) => Promise<Json>
  >;
};

/**
 * Stub the `snap` global with an in-memory implementation of
 * `snap_getState` and `snap_setState`.
 *
 * @param initialState - The initial snap state, by key.
 * @returns The state and the `snap.request` mock.
 */
export function stubSnap(initialState: Record<string, Json> = {}): SnapStub {
  const state = new Map<string, Json>(Object.entries(initialState));

  const request: SnapStub['request'] = vi.fn(async ({ method, params }) => {
    switch (method) {
      case 'snap_getState':
        return state.get(params.key) ?? null;
      case 'snap_setState':
        state.set(params.key, params.value ?? null);
        return null;
      default:
        throw new Error(`Unexpected method: ${method}`);
    }
  });

  vi.stubGlobal('snap', { request });
  return { state, request };
}
