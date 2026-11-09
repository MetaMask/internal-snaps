import type { IStateManager } from '@metamask/snap-networks-utils';
import { mock } from 'vitest-mock-extended';

import type { SnapState } from '../entities';
import {
  FULL_SCAN_QUEUE_KEY,
  FULL_SCAN_RETRY_BASE_MS,
  FULL_SCAN_RETRY_MAX_MS,
  FullScanQueue,
  getFullScanRetryDelayMs,
} from './FullScanQueue';

const clone = <Value>(value: Value): Value =>
  JSON.parse(JSON.stringify(value)) as Value;

const createStateClient = (
  initial: Record<string, unknown> = {},
): {
  stateManager: IStateManager<Partial<SnapState>>;
  state: Record<string, unknown>;
} => {
  const state: Record<string, unknown> = clone(initial);
  const stateManager = mock<IStateManager<Partial<SnapState>>>();
  stateManager.getKey.mockImplementation(async (key: string) =>
    Object.hasOwn(state, key) ? (clone(state[key]) as never) : undefined,
  );
  stateManager.setKey.mockImplementation(
    async (key: string, value: unknown) => {
      state[key] = clone(value);
    },
  );
  return { stateManager, state };
};

describe('getFullScanRetryDelayMs', () => {
  it('grows exponentially from the base delay and caps it', () => {
    expect(getFullScanRetryDelayMs(1)).toBe(FULL_SCAN_RETRY_BASE_MS);
    expect(getFullScanRetryDelayMs(2)).toBe(FULL_SCAN_RETRY_BASE_MS * 2);
    expect(getFullScanRetryDelayMs(3)).toBe(FULL_SCAN_RETRY_BASE_MS * 4);
    expect(getFullScanRetryDelayMs(50)).toBe(FULL_SCAN_RETRY_MAX_MS);
    // Bounded to minutes, not half an hour: an account whose first scan
    // failed must recover soon after the network comes back.
    expect(FULL_SCAN_RETRY_MAX_MS).toBe(5 * 60_000);
    expect(getFullScanRetryDelayMs(5)).toBe(FULL_SCAN_RETRY_MAX_MS);
  });
});

describe('FullScanQueue', () => {
  let now: number;
  const clock = (): number => now;

  beforeEach(() => {
    now = 1_000_000;
  });

  it('initializes the queue with every live account when it does not exist (repair behaviour)', async () => {
    const { stateManager } = createStateClient();
    const queue = new FullScanQueue(stateManager, clock);

    const due = await queue.due(['account-1', 'account-2'], 2);

    expect(due).toStrictEqual(['account-1', 'account-2']);
    expect(stateManager.setKey).toHaveBeenCalledWith(FULL_SCAN_QUEUE_KEY, {
      pending: ['account-1', 'account-2'],
    });
  });

  it('returns due accounts respecting backoff', async () => {
    const { stateManager, state } = createStateClient({
      rescanV1: { pending: ['a', 'b', 'c'] },
      fullScanRetryV1: {
        a: { attempts: 1, nextAttemptAt: now - 1 },
        b: { attempts: 1, nextAttemptAt: now + 10_000 },
        c: { attempts: 1, nextAttemptAt: now - 1 },
      },
    });
    const queue = new FullScanQueue(stateManager, clock);

    expect(await queue.due(['a', 'b', 'c'], 5)).toStrictEqual(['a', 'c']);
    expect(state.rescanV1).toStrictEqual({
      pending: ['a', 'b', 'c'],
    });
  });

  it('moves a failed account to the tail with backoff', async () => {
    const { stateManager, state } = createStateClient({
      rescanV1: { pending: ['a', 'b'] },
      fullScanRetryV1: {},
    });
    const queue = new FullScanQueue(stateManager, clock);

    await queue.markFailed('a', new Error('fetch failed'));

    expect(state.rescanV1).toStrictEqual({ pending: ['b', 'a'] });
    expect(state.fullScanRetryV1).toMatchObject({
      a: {
        attempts: 1,
        nextAttemptAt: now + FULL_SCAN_RETRY_BASE_MS,
        lastError: 'fetch failed',
      },
    });
  });

  it('removes an account from the queue after success', async () => {
    const { stateManager, state } = createStateClient({
      rescanV1: { pending: ['a', 'b'] },
      fullScanRetryV1: { a: { attempts: 1, nextAttemptAt: now } },
    });
    const queue = new FullScanQueue(stateManager, clock);

    await queue.markSucceeded('a');

    expect(state.rescanV1).toStrictEqual({ pending: ['b'] });
    expect(state.fullScanRetryV1).toStrictEqual({});
  });

  it('enqueues initial accounts', async () => {
    const { stateManager, state } = createStateClient({
      rescanV1: { pending: [] },
    });
    const queue = new FullScanQueue(stateManager, clock);

    await queue.enqueueInitial(['new-1']);

    expect(state.fullScanRetryV1).toMatchObject({
      'new-1': { attempts: 0, nextAttemptAt: now, initial: true },
    });
    expect(state.rescanV1).toStrictEqual({ pending: ['new-1'] });
  });

  it('flags initial scans via isInitialScanPending', async () => {
    const { stateManager } = createStateClient({
      fullScanRetryV1: {
        'new-1': { attempts: 0, nextAttemptAt: now, initial: true },
      },
    });
    const queue = new FullScanQueue(stateManager, clock);

    expect(await queue.isInitialScanPending('new-1')).toBe(true);
    expect(await queue.isInitialScanPending('other')).toBe(false);
  });

  it('ensureQueued adds never-synchronized accounts', async () => {
    const { stateManager, state } = createStateClient({
      rescanV1: { pending: [] },
    });
    const queue = new FullScanQueue(stateManager, clock);

    const added = await queue.ensureQueued(['legacy-1', 'legacy-2']);

    expect(added).toStrictEqual(['legacy-1', 'legacy-2']);
    expect(state.rescanV1).toStrictEqual({
      pending: ['legacy-1', 'legacy-2'],
    });
  });

  it('serializes concurrent updates', async () => {
    const { stateManager, state } = createStateClient({
      rescanV1: { pending: ['a'] },
    });
    const queue = new FullScanQueue(stateManager, clock);

    await Promise.all([
      queue.markFailed('a', 'first'),
      queue.markFailed('a', 'second'),
    ]);

    expect(
      (state.fullScanRetryV1 as { a: { attempts: number } }).a.attempts,
    ).toBe(2);
  });

  it('prunes retry entries for deleted accounts in due()', async () => {
    const { stateManager, state } = createStateClient({
      rescanV1: { pending: ['gone', 'live'] },
      fullScanRetryV1: {
        gone: { attempts: 0, nextAttemptAt: now - 1 },
        live: { attempts: 0, nextAttemptAt: now - 1 },
      },
    });
    const queue = new FullScanQueue(stateManager, clock);

    expect(await queue.due(['live'], 5)).toStrictEqual(['live']);
    expect(state.fullScanRetryV1).toStrictEqual({
      live: { attempts: 0, nextAttemptAt: now - 1 },
    });
  });

  it('stores only retry metadata when the queue does not exist yet', async () => {
    const { stateManager, state } = createStateClient();
    const queue = new FullScanQueue(stateManager, clock);

    await queue.enqueueInitial(['new-1']);

    expect(state.fullScanRetryV1).toBeDefined();
    expect(state.rescanV1).toBeUndefined();
  });
});
