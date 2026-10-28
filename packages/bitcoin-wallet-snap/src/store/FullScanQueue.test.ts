import type { SnapClient } from '../entities';
import {
  FULL_SCAN_QUEUE_KEY,
  FULL_SCAN_RETRY_BASE_MS,
  FULL_SCAN_RETRY_KEY,
  FULL_SCAN_RETRY_MAX_MS,
  FullScanQueue,
  getFullScanRetryDelayMs,
} from './FullScanQueue';

const clone = <Value>(value: Value): Value =>
  JSON.parse(JSON.stringify(value)) as Value;

const createStateClient = (
  initial: Record<string, unknown> = {},
): { client: SnapClient; state: Record<string, unknown> } => {
  const state: Record<string, unknown> = clone(initial);
  const client = {
    getState: jest.fn(async (key: string) =>
      Object.hasOwn(state, key) ? clone(state[key]) : null,
    ),
    setState: jest.fn(async (key: string, value: unknown) => {
      state[key] = clone(value);
    }),
  } as unknown as SnapClient;
  return { client, state };
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
    const { client, state } = createStateClient();
    const queue = new FullScanQueue(client, clock);

    expect(await queue.due(['a', 'b', 'c'], 2)).toStrictEqual(['a', 'b']);
    expect(state[FULL_SCAN_QUEUE_KEY]).toStrictEqual({
      pending: ['a', 'b', 'c'],
    });
  });

  it('prunes accounts that no longer exist', async () => {
    const { client, state } = createStateClient({
      [FULL_SCAN_QUEUE_KEY]: { pending: ['a', 'gone'] },
      [FULL_SCAN_RETRY_KEY]: {
        gone: { attempts: 1, nextAttemptAt: 0 },
      },
    });
    const queue = new FullScanQueue(client, clock);

    expect(await queue.due(['a'], 5)).toStrictEqual(['a']);
    expect(state[FULL_SCAN_QUEUE_KEY]).toStrictEqual({ pending: ['a'] });
    expect(state[FULL_SCAN_RETRY_KEY]).toStrictEqual({});
  });

  it('moves a failed account to the tail so it does not block the others', async () => {
    const { client } = createStateClient({
      [FULL_SCAN_QUEUE_KEY]: { pending: ['a', 'b'] },
    });
    const queue = new FullScanQueue(client, clock);

    await queue.markFailed('a', new Error('unreachable'));

    expect(await queue.due(['a', 'b'], 2)).toStrictEqual(['b']);
  });

  it('retries a failed account once its backoff has elapsed, with growing delays', async () => {
    const { client, state } = createStateClient({
      [FULL_SCAN_QUEUE_KEY]: { pending: ['a'] },
    });
    const queue = new FullScanQueue(client, clock);

    await queue.markFailed('a', new Error('boom'));
    expect(await queue.due(['a'], 1)).toStrictEqual([]);
    now += FULL_SCAN_RETRY_BASE_MS;
    expect(await queue.due(['a'], 1)).toStrictEqual(['a']);

    await queue.markFailed('a', 'again');
    expect(state[FULL_SCAN_RETRY_KEY]).toStrictEqual({
      a: {
        attempts: 2,
        nextAttemptAt: now + FULL_SCAN_RETRY_BASE_MS * 2,
        lastError: 'again',
      },
    });
  });

  it('removes an account and its retry metadata after a successful scan', async () => {
    const { client, state } = createStateClient({
      [FULL_SCAN_QUEUE_KEY]: { pending: ['a', 'b'] },
      [FULL_SCAN_RETRY_KEY]: {
        a: { attempts: 1, nextAttemptAt: 0, initial: true },
      },
    });
    const queue = new FullScanQueue(client, clock);

    await queue.markSucceeded('a');

    expect(state[FULL_SCAN_QUEUE_KEY]).toStrictEqual({ pending: ['b'] });
    expect(state[FULL_SCAN_RETRY_KEY]).toStrictEqual({});
    expect(await queue.isInitialScanPending('a')).toBe(false);
  });

  it('flags new accounts as pending their initial scan until it succeeds, across failures', async () => {
    const { client } = createStateClient({
      [FULL_SCAN_QUEUE_KEY]: { pending: [] },
    });
    const queue = new FullScanQueue(client, clock);

    await queue.enqueueInitial(['new']);
    expect(await queue.isInitialScanPending('new')).toBe(true);
    expect(await queue.due(['new'], 2)).toStrictEqual(['new']);

    await queue.markFailed('new', new Error('Failed to fetch'));
    expect(await queue.isInitialScanPending('new')).toBe(true);

    await queue.markSucceeded('new');
    expect(await queue.isInitialScanPending('new')).toBe(false);
  });

  it('records initial accounts even before the queue exists, and due() then includes them', async () => {
    const { client, state } = createStateClient();
    const queue = new FullScanQueue(client, clock);

    await queue.enqueueInitial(['new']);

    expect(state[FULL_SCAN_QUEUE_KEY]).toBeUndefined();
    expect(await queue.isInitialScanPending('new')).toBe(true);
    expect(await queue.due(['old', 'new'], 5)).toStrictEqual(['old', 'new']);
  });

  it('does nothing when enqueueing or ensuring no account', async () => {
    const { client } = createStateClient();
    const queue = new FullScanQueue(client, clock);

    await queue.enqueueInitial([]);
    expect(await queue.ensureQueued([])).toStrictEqual([]);
    expect(client.setState).not.toHaveBeenCalled();
  });

  describe('ensureQueued', () => {
    it('queues never-synchronized accounts and flags them as initial', async () => {
      const { client, state } = createStateClient({
        [FULL_SCAN_QUEUE_KEY]: { pending: [] },
      });
      const queue = new FullScanQueue(client, clock);

      expect(await queue.ensureQueued(['legacy'])).toStrictEqual(['legacy']);
      expect(state[FULL_SCAN_QUEUE_KEY]).toStrictEqual({
        pending: ['legacy'],
      });
      expect(await queue.isInitialScanPending('legacy')).toBe(true);
    });

    it('keeps the position and backoff of an already-queued account', async () => {
      const retryEntry = { attempts: 3, nextAttemptAt: now + 60_000 };
      const { client, state } = createStateClient({
        [FULL_SCAN_QUEUE_KEY]: { pending: ['legacy', 'other'] },
        [FULL_SCAN_RETRY_KEY]: { legacy: retryEntry },
      });
      const queue = new FullScanQueue(client, clock);

      expect(await queue.ensureQueued(['legacy'])).toStrictEqual([]);
      expect(state[FULL_SCAN_QUEUE_KEY]).toStrictEqual({
        pending: ['legacy', 'other'],
      });
      expect(state[FULL_SCAN_RETRY_KEY]).toStrictEqual({
        legacy: { ...retryEntry, initial: true },
      });
      expect(await queue.due(['legacy', 'other'], 2)).toStrictEqual(['other']);
    });

    it('does not write when nothing changes', async () => {
      const { client } = createStateClient({
        [FULL_SCAN_QUEUE_KEY]: { pending: ['legacy'] },
        [FULL_SCAN_RETRY_KEY]: {
          legacy: { attempts: 0, nextAttemptAt: 0, initial: true },
        },
      });
      const queue = new FullScanQueue(client, clock);

      await queue.ensureQueued(['legacy']);

      expect(client.setState).not.toHaveBeenCalled();
    });
  });

  it('serializes concurrent operations so no update is lost', async () => {
    const { client, state } = createStateClient({
      [FULL_SCAN_QUEUE_KEY]: { pending: ['a', 'b', 'c'] },
    });
    const queue = new FullScanQueue(client, clock);

    await Promise.all([
      queue.markSucceeded('a'),
      queue.markSucceeded('b'),
      queue.markFailed('c', new Error('x')),
    ]);

    expect(state[FULL_SCAN_QUEUE_KEY]).toStrictEqual({ pending: ['c'] });
  });

  it('ignores a corrupted stored state', async () => {
    const { client } = createStateClient({
      [FULL_SCAN_QUEUE_KEY]: { pending: 'not-an-array' },
      [FULL_SCAN_RETRY_KEY]: 42,
    });
    const queue = new FullScanQueue(client, clock);

    expect(await queue.due(['a'], 1)).toStrictEqual(['a']);
    expect(await queue.isInitialScanPending('a')).toBe(false);
  });
});
