import { InternalError } from '@metamask/snaps-sdk';

import { mockBrazeSdk } from '../tests/braze';
import { stubSnap } from '../tests/snap';
import { brazeSdkLoader } from './braze-sdk';
import {
  FLUSH_TIMEOUT_MS,
  MAX_PERSISTED_STORAGE_SIZE,
  STORAGE_STATE_KEY,
} from './constants';
import { GuardedXMLHttpRequest, drainRequests } from './network';
import type { BrazeConfig } from './runtime';
import { resetRuntime, withBraze } from './runtime';
import { resetStorage, storageShim } from './storage';

const CONFIG: BrazeConfig = {
  apiKey: '00000000-0000-0000-0000-000000000000',
  endpoint: 'sdk.iad-01.braze.com',
  appVersion: '13.0.0',
};

const DATA_URL = 'https://sdk.iad-01.braze.com/api/v3/data/';

/**
 * Send a request to the Braze data endpoint, as the SDK would.
 *
 * @returns Whether the request loaded.
 */
async function sendDataRequest(): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new GuardedXMLHttpRequest();
    xhr.onload = (): void => resolve(true);
    xhr.onerror = (): void => resolve(false);
    xhr.ontimeout = (): void => resolve(false);
    xhr.open('POST', DATA_URL);
    xhr.send('{}');
  });
}

describe('withBraze', () => {
  beforeEach(() => {
    resetRuntime();
    resetStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('initializes the SDK without DOM, cookies, push, or remote code', async () => {
    stubSnap();
    const { initialize, DeviceProperties } = mockBrazeSdk();

    await withBraze({ ...CONFIG, enableLogging: true }, () => undefined);

    expect(initialize).toHaveBeenCalledWith(CONFIG.apiKey, {
      baseUrl: CONFIG.endpoint,
      appVersion: CONFIG.appVersion,
      enableLogging: true,
      noCookies: true,
      doNotLoadFontAwesome: true,
      allowUserSuppliedJavascript: false,
      manageServiceWorkerExternally: true,
      disablePushTokenMaintenance: true,
      devicePropertyAllowlist: [DeviceProperties.TIME_ZONE],
    });
  });

  it('loads the SDK once', async () => {
    stubSnap();
    mockBrazeSdk();

    await withBraze(CONFIG, () => undefined);
    await withBraze(CONFIG, () => undefined);

    expect(brazeSdkLoader.load).toHaveBeenCalledTimes(1);
  });

  it('initializes the SDK once for the same config', async () => {
    stubSnap();
    const { initialize, destroy } = mockBrazeSdk();

    await withBraze(CONFIG, () => undefined);
    await withBraze(CONFIG, () => undefined);

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it('initializes the SDK again when the config changes', async () => {
    stubSnap();
    const { initialize, destroy } = mockBrazeSdk();

    await withBraze(CONFIG, () => undefined);
    await withBraze({ ...CONFIG, appVersion: '13.1.0' }, () => undefined);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('throws when the SDK fails to initialize, and tries again next time', async () => {
    stubSnap();
    const sdk = mockBrazeSdk();
    const { initialize } = sdk;
    initialize.mockReturnValueOnce(false);
    const callback = vi.fn();

    await expect(withBraze(CONFIG, callback)).rejects.toThrow(
      'Failed to initialize Braze.',
    );
    expect(callback).not.toHaveBeenCalled();

    await withBraze(CONFIG, callback);
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith(sdk);
  });

  it('returns the callback result', async () => {
    stubSnap();
    mockBrazeSdk();

    expect(await withBraze(CONFIG, () => 'result')).toBe('result');
  });

  it('hydrates, runs, flushes, then persists once', async () => {
    const { request } = stubSnap();
    const { requestImmediateDataFlush } = mockBrazeSdk();
    const calls: string[] = [];
    request.mockImplementation(async ({ method }) => {
      calls.push(method);
      return null;
    });
    requestImmediateDataFlush.mockImplementation((onFlushed) => {
      calls.push('flush');
      storageShim.setItem('ab.storage.events', '[]');
      onFlushed?.(true);
    });

    await withBraze(CONFIG, () => {
      calls.push('callback');
      storageShim.setItem('ab.storage.userId', 'profile');
    });

    expect(calls).toStrictEqual([
      'snap_getState',
      'callback',
      'flush',
      'snap_setState',
    ]);
  });

  it('only allows network access while the request runs', async () => {
    stubSnap();
    mockBrazeSdk();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('{}'),
    );

    let loadedDuringRequest = false;
    await withBraze(CONFIG, async () => {
      loadedDuringRequest = await sendDataRequest();
    });
    await drainRequests();

    expect(loadedDuringRequest).toBe(true);
    expect(await sendDataRequest()).toBe(false);
  });

  it('waits for the requests the flush started', async () => {
    stubSnap();
    const { requestImmediateDataFlush } = mockBrazeSdk();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('{}'),
    );
    let loaded = false;
    requestImmediateDataFlush.mockImplementation((onFlushed) => {
      const xhr = new GuardedXMLHttpRequest();
      xhr.onload = (): void => {
        loaded = true;
      };
      xhr.open('POST', DATA_URL);
      xhr.send('{}');
      onFlushed?.(true);
    });

    await withBraze(CONFIG, () => undefined);

    expect(loaded).toBe(true);
  });

  it('stops waiting for the flush after a timeout and aborts requests', async () => {
    vi.useFakeTimers();
    stubSnap();
    const { requestImmediateDataFlush } = mockBrazeSdk();
    requestImmediateDataFlush.mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('Aborted')),
          );
        }),
    );
    let requestLoaded: Promise<boolean> | undefined;

    const result = withBraze(CONFIG, () => {
      setTimeout(() => {
        requestLoaded = sendDataRequest();
      }, FLUSH_TIMEOUT_MS / 2);
    });
    while (requestImmediateDataFlush.mock.calls.length === 0) {
      await Promise.resolve();
    }
    await vi.advanceTimersByTimeAsync(FLUSH_TIMEOUT_MS);

    expect(await result).toBeUndefined();
    expect(await requestLoaded).toBe(false);
  });

  it('persists the storage when the callback throws', async () => {
    const { state } = stubSnap();
    mockBrazeSdk();

    await expect(
      withBraze(CONFIG, () => {
        storageShim.setItem('ab.storage.userId', 'profile');
        throw new Error('Callback failure');
      }),
    ).rejects.toThrow('Callback failure');

    expect(state.get(STORAGE_STATE_KEY)).toStrictEqual({
      version: 1,
      items: { 'ab.storage.userId': 'profile' },
    });
  });

  it('destroys the SDK and wipes the storage when it grows too large', async () => {
    const { state, request } = stubSnap();
    const { initialize, destroy } = mockBrazeSdk();

    const error = await withBraze(CONFIG, () => {
      storageShim.setItem(
        'ab.storage.events',
        'x'.repeat(MAX_PERSISTED_STORAGE_SIZE),
      );
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InternalError);
    expect(error).toMatchObject({
      message: 'The Braze storage reached its size limit and was wiped.',
      data: {
        size: expect.any(Number),
        limit: MAX_PERSISTED_STORAGE_SIZE,
      },
    });

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(state.get(STORAGE_STATE_KEY)).toStrictEqual({
      version: 1,
      items: {},
    });

    request.mockClear();
    await withBraze(CONFIG, () => undefined);
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'snap_getState' }),
    );
  });

  it('keeps the SDK when persisting the storage fails', async () => {
    const { request } = stubSnap();
    const { destroy } = mockBrazeSdk();
    request
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('State failure'));

    await expect(
      withBraze(CONFIG, () => {
        storageShim.setItem('ab.storage.userId', 'profile');
      }),
    ).rejects.toThrow('State failure');
    expect(destroy).not.toHaveBeenCalled();
  });

  it('does not interleave requests', async () => {
    stubSnap();
    mockBrazeSdk();
    const events: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withBraze(CONFIG, async () => {
      events.push('first start');
      await firstReleased;
      events.push('first end');
    });
    const second = withBraze(CONFIG, () => {
      events.push('second');
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseFirst();
    await Promise.all([first, second]);

    expect(events).toStrictEqual(['first start', 'first end', 'second']);
  });

  it('keeps running requests after one fails', async () => {
    stubSnap();
    mockBrazeSdk();

    const failed = withBraze(CONFIG, () => {
      throw new Error('Failure');
    });
    const succeeded = withBraze(CONFIG, () => 'ok');

    await expect(failed).rejects.toThrow('Failure');
    expect(await succeeded).toBe('ok');
  });
});
