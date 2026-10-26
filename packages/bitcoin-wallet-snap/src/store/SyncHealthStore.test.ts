import { mock } from 'jest-mock-extended';

import type { SnapClient } from '../entities';
import {
  BALANCE_STALE_AFTER_MS,
  SYNC_HEALTH_KEY,
  SyncHealthStore,
} from './SyncHealthStore';

describe('SyncHealthStore', () => {
  const build = (): {
    store: SyncHealthStore;
    snapClient: ReturnType<typeof mock<SnapClient>>;
    state: Record<string, unknown>;
    clock: { now: number };
  } => {
    const state: Record<string, unknown> = {};
    const clock = { now: 1_000_000 };
    const snapClient = mock<SnapClient>();
    snapClient.getState.mockImplementation(async (key?: string) =>
      key !== undefined && Object.hasOwn(state, key)
        ? (JSON.parse(JSON.stringify(state[key])) as never)
        : (null as never),
    );
    snapClient.setState.mockImplementation(async (key, value) => {
      state[key as string] = JSON.parse(JSON.stringify(value));
    });
    return {
      store: new SyncHealthStore(snapClient, () => clock.now),
      snapClient,
      state,
      clock,
    };
  };

  it('is not stale for an account without failures', async () => {
    const { store } = build();

    expect(await store.isStale('a')).toBe(false);
    await store.recordSuccess('a');
    expect(await store.isStale('a')).toBe(false);
  });

  it('counts the stale time from the last success, not the first failure', async () => {
    const { store, clock } = build();

    await store.recordSuccess('a');
    clock.now += 60_000;
    await store.recordFailure('a');
    clock.now += BALANCE_STALE_AFTER_MS - 60_000 - 1;
    expect(await store.isStale('a')).toBe(false);
    clock.now += 1;
    expect(await store.isStale('a')).toBe(true);
  });

  it('counts from the first failure when no success was seen', async () => {
    const { store, clock } = build();

    await store.recordFailure('a');
    clock.now += 30_000;
    await store.recordFailure('a');
    clock.now += BALANCE_STALE_AFTER_MS - 30_000;
    expect(await store.isStale('a')).toBe(true);
  });

  it('writes only on transitions and clears on success', async () => {
    const { store, snapClient, state } = build();

    await store.recordSuccess('a');
    expect(snapClient.setState).not.toHaveBeenCalled();
    await store.recordFailure('a');
    await store.recordFailure('a');
    expect(snapClient.setState).toHaveBeenCalledTimes(1);
    expect(state[SYNC_HEALTH_KEY]).toStrictEqual({
      a: { staleSince: 1_000_000 },
    });
    await store.recordSuccess('a');
    await store.recordSuccess('a');
    expect(snapClient.setState).toHaveBeenCalledTimes(2);
    expect(state[SYNC_HEALTH_KEY]).toStrictEqual({});
  });

  it('forgets a deleted account', async () => {
    const { store, clock } = build();

    await store.recordFailure('a');
    clock.now += BALANCE_STALE_AFTER_MS;
    await store.forget('a');
    expect(await store.isStale('a')).toBe(false);
  });

  it('ignores malformed state', async () => {
    const { store, state, clock } = build();
    state[SYNC_HEALTH_KEY] = { a: { staleSince: 'x' } };

    clock.now += BALANCE_STALE_AFTER_MS;
    expect(await store.isStale('a')).toBe(false);
  });
});
