import nock from 'nock';

import { stubSnap } from '../tests/snap';
import { brazeSdkLoader } from './braze-sdk';
import { STORAGE_STATE_KEY } from './constants';
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
 */
async function syncUser(profileId: string, language?: string): Promise<void> {
  await onClientRequest({
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
  });
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
    expect((await brazeSdkLoader.load()).getUser()?.getUserId()).toBe(
      'profile-a',
    );
  });

  it('switches to another user', async () => {
    stubSnap();
    await syncUser('profile-a');
    requests = [];

    await syncUser('profile-b');

    expect(getEventUserIds(requests)).toContain('profile-b');
    expect((await brazeSdkLoader.load()).getUser()?.getUserId()).toBe(
      'profile-b',
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

  it('sends nothing and writes state at most once when the user is unchanged', async () => {
    const { request } = stubSnap();
    await syncUser('profile-a');
    request.mockClear();
    requests = [];

    await syncUser('profile-a');

    expect(requests).toStrictEqual([]);
    expect(request.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
