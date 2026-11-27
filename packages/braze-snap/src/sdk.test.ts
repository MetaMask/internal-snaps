import nock from 'nock';

import { stubSnap } from '../tests/snap';
import { brazeSdkLoader } from './braze-sdk';
import { SESSION_TIMEOUT_SECONDS, STORAGE_STATE_KEY } from './constants';
import { abortRequests, drainRequests } from './network';
import { BrazeMethod, onClientRequest } from './rpc';
import { resetRuntime } from './runtime';
import * as globals from './shims/globals';
import type { ProvidedGlobal } from './shims/provided-globals';
import { PROVIDED_GLOBALS } from './shims/provided-globals';
import { resetStorage } from './storage';

const shims: Record<ProvidedGlobal, unknown> = globals;

const API_KEY = '00000000-0000-0000-0000-000000000000';
const ENDPOINT = 'sdk.iad-01.braze.com';

type DataRequest = {
  attributes?: { user_id?: string; language?: string }[];
  device_id?: string;
  device?: Record<string, string>;
  events?: { name: string; user_id?: string }[];
};

/**
 * Identify the device as a user through the client request handler.
 *
 * @param profileId - The profile ID.
 * @param language - The language, if any.
 * @returns The handler result.
 */
async function syncUser(
  profileId: string,
  language?: string,
): Promise<{ flushed: boolean }> {
  return (await onClientRequest({
    request: {
      jsonrpc: '2.0',
      id: 1,
      method: BrazeMethod.SyncUser,
      params: {
        profileId,
        ...(language === undefined ? {} : { language }),
        config: { apiKey: API_KEY, endpoint: ENDPOINT, appVersion: '13.0.0' },
      },
    },
  })) as { flushed: boolean };
}

/**
 * Stop the snap the way the client does when it idles: the SDK and the
 * in-memory storage are gone, only snap state remains.
 */
async function restartSnap(): Promise<void> {
  (await brazeSdkLoader.load()).destroy();
  abortRequests();
  await drainRequests();
  resetStorage();
  resetRuntime();
}

/**
 * Get the user IDs of the events in a list of requests.
 *
 * @param requests - The requests.
 * @returns The user IDs.
 */
function getEventUserIds(requests: DataRequest[]): (string | undefined)[] {
  return requests.flatMap(({ events = [] }) =>
    events.map(({ user_id: userId }) => userId),
  );
}

/**
 * Get the names of the events in a list of requests.
 *
 * @param requests - The requests.
 * @returns The event names.
 */
function getEventNames(requests: DataRequest[]): string[] {
  return requests.flatMap(({ events = [] }) => events.map(({ name }) => name));
}

describe('Braze Web SDK in the snap globals', () => {
  let requests: DataRequest[];

  beforeEach(() => {
    resetRuntime();
    resetStorage();
    for (const name of PROVIDED_GLOBALS) {
      vi.stubGlobal(name, shims[name]);
    }

    requests = [];
    nock(`https://${ENDPOINT}`)
      .persist()
      .post('/api/v3/data/')
      .reply(200, (_uri, body) => {
        requests.push(body as DataRequest);
        return {};
      });
  });

  afterEach(async () => {
    await restartSnap();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('identifies the user and keeps the device and session across restarts', async () => {
    const { state, request } = stubSnap();

    await syncUser('profile-a');

    expect(getEventNames(requests)).toContain('ss');
    const deviceId = requests[0]?.device_id;
    expect(deviceId).toStrictEqual(expect.any(String));
    expect(getEventUserIds(requests)).toContain('profile-a');
    expect(requests[0]?.device).toStrictEqual({
      time_zone: expect.any(String),
    });

    const persisted = state.get(STORAGE_STATE_KEY) as {
      items: Record<string, string>;
    };
    expect(Object.keys(persisted.items)).toStrictEqual(
      expect.arrayContaining([
        `ab.storage.deviceId.${API_KEY}`,
        `ab.storage.userId.${API_KEY}`,
        `ab.storage.sessionId.${API_KEY}`,
      ]),
    );
    expect(
      request.mock.calls.filter(([{ method }]) => method === 'snap_setState'),
    ).toHaveLength(1);

    await restartSnap();
    requests = [];

    await syncUser('profile-a');

    expect(getEventNames(requests)).not.toContain('ss');
    for (const { device_id: requestDeviceId } of requests) {
      expect(requestDeviceId).toBe(deviceId);
    }
    const persistedAfterRestart = state.get(STORAGE_STATE_KEY) as {
      items: Record<string, string>;
    };
    expect(
      persistedAfterRestart.items[`ab.storage.userId.${API_KEY}`],
    ).toContain('g:profile-a|');
  });

  it('switches to another user', async () => {
    const { state } = stubSnap();
    await syncUser('profile-a');
    requests = [];

    await syncUser('profile-b');

    expect(getEventUserIds(requests)).toContain('profile-b');
    const persisted = state.get(STORAGE_STATE_KEY) as {
      items: Record<string, string>;
    };
    expect(persisted.items[`ab.storage.userId.${API_KEY}`]).toContain(
      'g:profile-b|',
    );
  });

  it('sends the language with session start in one request and only once per user', async () => {
    stubSnap();

    await syncUser('profile-a', 'fr');

    expect(requests).toHaveLength(1);
    expect(getEventNames(requests)).toContain('ss');
    expect(requests.flatMap(({ attributes = [] }) => attributes)).toStrictEqual(
      [{ user_id: 'profile-a', language: 'fr' }],
    );

    await restartSnap();
    requests = [];
    await syncUser('profile-a', 'fr');

    expect(requests.flatMap(({ attributes = [] }) => attributes)).toStrictEqual(
      [],
    );
  });

  it('re-sends the language with the new session after the session timeout expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    stubSnap();

    await syncUser('profile-a', 'fr');
    expect(requests).toHaveLength(1);

    await restartSnap();
    requests = [];
    await vi.advanceTimersByTimeAsync((SESSION_TIMEOUT_SECONDS - 60) * 1000);
    await syncUser('profile-a', 'fr');
    expect(requests).toStrictEqual([]);

    await restartSnap();
    requests = [];
    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_SECONDS * 1000 + 1);
    await syncUser('profile-a', 'fr');

    expect(requests).toHaveLength(1);
    expect(getEventNames(requests)).toStrictEqual(
      expect.arrayContaining(['se', 'ss']),
    );
    expect(requests.flatMap(({ attributes = [] }) => attributes)).toStrictEqual(
      [{ user_id: 'profile-a', language: 'fr' }],
    );
  });

  it('sends nothing and writes state at most once when the user is unchanged', async () => {
    const { request } = stubSnap();
    await syncUser('profile-a');
    request.mockClear();
    requests = [];

    expect(await syncUser('profile-a')).toStrictEqual({ flushed: true });

    expect(requests).toStrictEqual([]);
    expect(
      request.mock.calls.filter(([{ method }]) => method === 'snap_setState')
        .length,
    ).toBeLessThanOrEqual(1);
  });

  it('preserves queued session and language across 500 errors and flushes on retry', async () => {
    nock.cleanAll();
    nock(`https://${ENDPOINT}`).post('/api/v3/data/').reply(500, {});
    stubSnap();

    expect(await syncUser('profile-a', 'fr')).toStrictEqual({ flushed: false });
    expect(requests).toStrictEqual([]);

    nock(`https://${ENDPOINT}`)
      .persist()
      .post('/api/v3/data/')
      .reply(200, (_uri, body) => {
        requests.push(body as DataRequest);
        return {};
      });
    expect(await syncUser('profile-a', 'fr')).toStrictEqual({ flushed: true });
    expect(getEventNames(requests)).toContain('ss');
    expect(requests.flatMap(({ attributes = [] }) => attributes)).toStrictEqual(
      [{ user_id: 'profile-a', language: 'fr' }],
    );
  });

  it('does not wedge rate-limit timers across RPCs after idle teardown', async () => {
    vi.useFakeTimers();
    nock.cleanAll();
    const serverTime = Date.now();
    nock(`https://${ENDPOINT}`)
      .post('/api/v3/data/')
      .reply(200, (_uri, body) => {
        requests.push(body as DataRequest);
        return {
          config: {
            time: serverTime,
            global_request_rate_limit: {
              enabled: true,
              capacity: 10,
              refill_rate: 10,
              endpoint_overrides: {
                data: { capacity: 10, refill_rate: 10 },
              },
            },
          },
        };
      });
    const { state } = stubSnap();

    expect(await syncUser('profile-a')).toStrictEqual({ flushed: true });

    // Exhaust the persisted token bucket so the SDK schedules NetworkManager's
    // rate-limit retry timer (`NetworkManager.hd`), then time out flush so the
    // RPC exits without that timer firing.
    const persisted = state.get(STORAGE_STATE_KEY) as {
      version: 1;
      items: Record<string, string>;
    };
    persisted.items[`ab.storage.globalRateLimitCurrentTokenCount.${API_KEY}`] =
      JSON.stringify({ v: 0 });
    persisted.items[`ab.storage.lastSdkReq.${API_KEY}`] = JSON.stringify({
      v: Date.now(),
    });

    const rateLimitedSync = syncUser('profile-b');
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await rateLimitedSync).toStrictEqual({ flushed: false });

    // Advance time enough for tokens to refill, and ensure the next RPC sends
    // cleanly rather than getting stuck on stale `NetworkManager.hd` timers.
    await vi.advanceTimersByTimeAsync(20_000);
    nock(`https://${ENDPOINT}`)
      .persist()
      .post('/api/v3/data/')
      .reply(200, (_uri, body) => {
        requests.push(body as DataRequest);
        return {};
      });
    expect(await syncUser('profile-c')).toStrictEqual({ flushed: true });
    expect(getEventUserIds(requests)).toContain('profile-c');
    vi.useRealTimers();
  });
});
