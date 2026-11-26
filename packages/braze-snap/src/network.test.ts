import nock from 'nock';

import { NETWORK_LIMITS } from './constants';
import {
  GuardedXMLHttpRequest,
  abortRequests,
  drainRequests,
  hasRequestFailure,
  resetRequestFailures,
  setAllowedEndpoint,
} from './network';

const ENDPOINT = 'sdk.iad-01.braze.com';
const DATA_URL = `https://${ENDPOINT}/api/v3/data/`;

type Result = 'load' | 'error' | 'timeout';

/**
 * Send a request the way the SDK does, and resolve with the callback that
 * fired.
 *
 * @param options - The request options.
 * @param options.method - The method.
 * @param options.url - The URL.
 * @param options.body - The body.
 * @param options.headers - Extra headers.
 * @returns The request and its result.
 */
function send({
  method = 'POST',
  url = DATA_URL,
  body = '{}',
  headers = {},
}: {
  method?: string;
  url?: string;
  body?: string;
  headers?: Record<string, string>;
} = {}): { xhr: GuardedXMLHttpRequest; result: Promise<Result> } {
  const xhr = new GuardedXMLHttpRequest();
  const result = new Promise<Result>((resolve) => {
    xhr.onload = (): void => resolve('load');
    xhr.onerror = (): void => resolve('error');
    xhr.ontimeout = (): void => resolve('timeout');
  });
  xhr.open(method, url);
  for (const [name, value] of Object.entries(headers)) {
    xhr.setRequestHeader(name, value);
  }
  xhr.send(body);
  return { xhr, result };
}

/**
 * Mock `fetch` with requests that only settle when aborted.
 *
 * @returns The `fetch` spy.
 */
function mockHangingFetch(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('Aborted')),
        );
      }),
  );
}

describe('GuardedXMLHttpRequest', () => {
  beforeEach(() => {
    resetRequestFailures();
    setAllowedEndpoint(ENDPOINT);
  });

  afterEach(async () => {
    abortRequests();
    await drainRequests();
    setAllowedEndpoint(null);
    vi.useRealTimers();
  });

  it('sends allowed requests with fetch and reports the response', async () => {
    const scope = nock(`https://${ENDPOINT}`)
      .post('/api/v3/data/', { events: [] })
      .matchHeader('X-Braze-Api-Key', 'key')
      .reply(201, '{"ok":true}', { 'X-Test': 'yes' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { xhr, result } = send({
      body: '{"events":[]}',
      headers: { 'X-Braze-Api-Key': 'key' },
    });

    expect(await result).toBe('load');
    expect(xhr.readyState).toBe(4);
    expect(xhr.status).toBe(201);
    expect(xhr.responseText).toBe('{"ok":true}');
    expect(xhr.getAllResponseHeaders()).toContain('x-test: yes\r\n');
    expect(fetchSpy).toHaveBeenCalledWith(
      DATA_URL,
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      }),
    );
    scope.done();
  });

  it('forwards request headers including long values', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));
    const longSignature = 'x'.repeat(2048);

    await send({
      headers: {
        'Content-type': 'application/json',
        'X-Braze-Auth-Signature': longSignature,
      },
    }).result;

    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toStrictEqual({
      'Content-type': 'application/json',
      'X-Braze-Auth-Signature': longSignature,
    });
  });

  it.each([
    ['a GET request', { method: 'GET' }],
    ['another path', { url: `https://${ENDPOINT}/api/v3/content_cards/sync` }],
    ['a query string', { url: `${DATA_URL}?a=b` }],
    ['another host', { url: 'https://sdk.fra-01.braze.eu/api/v3/data/' }],
    ['plain HTTP', { url: `http://${ENDPOINT}/api/v3/data/` }],
    ['credentials', { url: `https://user:pass@${ENDPOINT}/api/v3/data/` }],
    [
      'a body above the limit',
      { body: 'x'.repeat(NETWORK_LIMITS.maxRequestBodyBytes + 1) },
    ],
  ])('blocks %s', async (_, options) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { xhr, result } = send(options);

    expect(await result).toBe('error');
    expect(xhr.status).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends a body up to the request size limit', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));

    const body = 'x'.repeat(NETWORK_LIMITS.maxRequestBodyBytes);

    expect(await send({ body }).result).toBe('load');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('blocks every request when no endpoint is allowed', async () => {
    setAllowedEndpoint(null);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    expect(await send().result).toBe('error');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('counts the body size in UTF-8 bytes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const body = 'é'.repeat(NETWORK_LIMITS.maxRequestBodyBytes / 2 + 1);

    expect(await send({ body }).result).toBe('error');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends an empty body when none is given', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));
    const xhr = new GuardedXMLHttpRequest();
    xhr.open('post', DATA_URL);

    xhr.send();
    await drainRequests();

    expect(fetchSpy.mock.calls[0]?.[1]?.body).toBe('');
  });

  it('limits the number of concurrent requests', async () => {
    const fetchSpy = mockHangingFetch();

    const results = Array.from(
      { length: NETWORK_LIMITS.maxConcurrentRequests + 1 },
      () => send().result,
    );

    expect(await results[NETWORK_LIMITS.maxConcurrentRequests]).toBe('error');
    expect(fetchSpy).toHaveBeenCalledTimes(
      NETWORK_LIMITS.maxConcurrentRequests,
    );
  });

  it('times out requests that take too long', async () => {
    vi.useFakeTimers();
    mockHangingFetch();

    const { result } = send();
    await vi.advanceTimersByTimeAsync(NETWORK_LIMITS.requestTimeoutMs);

    expect(await result).toBe('timeout');
  });

  it('reports a failed fetch as an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline'));

    expect(await send().result).toBe('error');
  });

  it('rejects responses whose declared size is above the limit and cancels web bodies', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const response = {
      headers: new Headers({
        'Content-Length': String(NETWORK_LIMITS.maxResponseBodyBytes + 1),
      }),
      body: { cancel },
    } as unknown as Response;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);

    expect(await send().result).toBe('error');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(hasRequestFailure()).toBe(true);
  });

  it('rejects oversized stream responses without a Web Streams cancel method', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        headers: {
          'Content-Length': String(NETWORK_LIMITS.maxResponseBodyBytes + 1),
        },
      }),
    );

    expect(await send().result).toBe('error');
    expect(hasRequestFailure()).toBe(true);
  });

  it('rejects oversized empty-body responses without failing on null body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        headers: {
          'Content-Length': String(NETWORK_LIMITS.maxResponseBodyBytes + 1),
        },
      }),
    );

    expect(await send().result).toBe('error');
    expect(hasRequestFailure()).toBe(true);
  });

  it('rejects response bodies above the limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('x'.repeat(NETWORK_LIMITS.maxResponseBodyBytes + 1)),
    );

    expect(await send().result).toBe('error');
    expect(hasRequestFailure()).toBe(true);
  });

  it('reports non-2xx responses through onload with their status and records failure for >= 400', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 500 }),
    );

    const { xhr, result } = send();

    expect(await result).toBe('load');
    expect(xhr.status).toBe(500);
    expect(hasRequestFailure()).toBe(true);
  });

  it('does not record failure when a blocked URL or 2xx response occurs', async () => {
    await send({ url: `https://${ENDPOINT}/api/v3/dust/config` }).result;
    expect(hasRequestFailure()).toBe(false);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    expect(await send().result).toBe('load');
    expect(hasRequestFailure()).toBe(false);
  });

  it('ignores errors thrown by SDK callbacks', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const xhr = new GuardedXMLHttpRequest();
    xhr.onload = (): void => {
      throw new Error('SDK failure');
    };
    xhr.open('POST', DATA_URL);
    xhr.send('{}');

    expect(await drainRequests()).toBeUndefined();
  });

  it('runs without callbacks', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline'));
    const xhr = new GuardedXMLHttpRequest();
    xhr.open('POST', DATA_URL);
    xhr.send('{}');

    expect(await drainRequests()).toBeUndefined();
    expect(xhr.readyState).toBe(4);
  });
});

describe('abortRequests', () => {
  afterEach(() => {
    setAllowedEndpoint(null);
  });

  it('aborts running requests, which report an error', async () => {
    setAllowedEndpoint(ENDPOINT);
    mockHangingFetch();

    const { result } = send();
    abortRequests();

    expect(await result).toBe('error');
  });
});

describe('drainRequests', () => {
  afterEach(() => {
    setAllowedEndpoint(null);
  });

  it('waits for requests started by SDK callbacks', async () => {
    setAllowedEndpoint(ENDPOINT);
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('{}'),
    );
    const completed: string[] = [];

    const first = new GuardedXMLHttpRequest();
    first.onload = (): void => {
      completed.push('first');
      const second = new GuardedXMLHttpRequest();
      second.onload = (): void => {
        completed.push('second');
      };
      second.open('POST', DATA_URL);
      second.send('{}');
    };
    first.open('POST', DATA_URL);
    first.send('{}');

    await drainRequests();

    expect(completed).toStrictEqual(['first', 'second']);
  });

  it('resolves immediately when nothing is running', async () => {
    expect(await drainRequests()).toBeUndefined();
  });
});
