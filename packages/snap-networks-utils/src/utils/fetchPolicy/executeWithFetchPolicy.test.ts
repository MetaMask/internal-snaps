import { mockLogger } from '../logger/__mocks__/Logger';
import {
  createFetchPolicyError,
  FetchPolicyErrorName,
} from './createFetchPolicy';
import { createFetchPolicy } from './createFetchPolicy';
import {
  executeWithFetchPolicy,
  fetchWithPolicy,
  parseRetryAfter,
} from './executeWithFetchPolicy';

const makePolicy = (): ReturnType<typeof createFetchPolicy> =>
  createFetchPolicy({ service: 'test', logger: mockLogger });

describe('parseRetryAfter', () => {
  it('parses a delay in seconds', () => {
    expect(parseRetryAfter('2')).toBe(2000);
  });

  it('returns undefined for a non-string value', () => {
    expect(parseRetryAfter(undefined)).toBeUndefined();
  });

  it('clamps a past or negative delay to zero', () => {
    expect(parseRetryAfter('-1.5')).toBe(0);
  });

  it('returns undefined for an unparsable date', () => {
    expect(parseRetryAfter('not a date')).toBeUndefined();
  });

  it('parses a future date and clamps it to zero when it has passed', () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    expect(parseRetryAfter(future)).toBeGreaterThan(0);
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:00:00 GMT')).toBe(0);
  });
});

describe('executeWithFetchPolicy', () => {
  it('returns the operation result', async () => {
    const policy = makePolicy();
    expect(await executeWithFetchPolicy(policy, async () => 'ok')).toBe('ok');
  });

  it('does not retry JSON parsing failures', async () => {
    const policy = makePolicy();
    const error = new SyntaxError('Invalid JSON');
    const operation = jest.fn().mockRejectedValue(error);

    let caught: unknown;
    try {
      await executeWithFetchPolicy(policy, operation);
    } catch (thrown) {
      caught = thrown;
    }

    expect(caught).toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('does not retry explicit aborts', async () => {
    const policy = makePolicy();
    const error = new DOMException('Aborted', 'AbortError');
    const operation = jest.fn().mockRejectedValue(error);

    let caught: unknown;
    try {
      await executeWithFetchPolicy(policy, operation);
    } catch (thrown) {
      caught = thrown;
    }

    expect(caught).toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('does not rewrap policy-shaped errors', async () => {
    const policy = makePolicy();
    const error = createFetchPolicyError('HTTP 429', { httpStatus: 429 });
    const operation = jest.fn().mockRejectedValue(error);

    let caught: unknown;
    try {
      await executeWithFetchPolicy(policy, operation);
    } catch (thrown) {
      caught = thrown;
    }

    expect(caught).toBe(error);
  });

  it('does not rewrap network and timeout errors', async () => {
    const policy = makePolicy();
    for (const name of [
      FetchPolicyErrorName.Network,
      FetchPolicyErrorName.Timeout,
    ]) {
      const error = createFetchPolicyError('Failed', { name });
      const operation = jest.fn().mockRejectedValue(error);

      let caught: unknown;
      try {
        await executeWithFetchPolicy(policy, operation);
      } catch (thrown) {
        caught = thrown;
      }

      expect(caught).toBe(error);
    }
  });

  it('maps unknown errors with the given mapper', async () => {
    const policy = makePolicy();
    const mapped = createFetchPolicyError('HTTP 507', { httpStatus: 507 });
    const operation = jest.fn().mockRejectedValue(new Error('Unexpected'));

    let caught: unknown;
    try {
      await executeWithFetchPolicy(policy, operation, () => mapped);
    } catch (thrown) {
      caught = thrown;
    }

    expect(caught).toBe(mapped);
  });

  it('maps unknown errors to network failures by default', async () => {
    const policy = makePolicy();
    const cause = new Error('socket closed');
    const operation = jest.fn().mockRejectedValue(cause);

    let caught: unknown;
    try {
      await executeWithFetchPolicy(policy, operation);
    } catch (thrown) {
      caught = thrown;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe(FetchPolicyErrorName.Network);
    expect((caught as Error).cause).toBe(cause);
  });

  it('maps non-error rejections to network failures by default', async () => {
    const policy = makePolicy();
    const operation = jest.fn().mockRejectedValue('boom');

    let caught: unknown;
    try {
      await executeWithFetchPolicy(policy, operation);
    } catch (thrown) {
      caught = thrown;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('Network request failed');
  });
});

type StubResponse = {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  text: () => Promise<string>;
};

describe('fetchWithPolicy', () => {
  const okResponse = (): StubResponse => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => 'body',
  });

  const statusResponse = (
    status: number,
    headers: Record<string, string> = {},
  ): StubResponse => ({
    ok: false,
    status,
    headers: {
      get: (name: string) =>
        Object.entries(headers).find(
          ([key]) => key.toLowerCase() === name.toLowerCase(),
        )?.[1] ?? null,
    },
    text: async () => '',
  });

  it('returns the response body text', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse());

    expect(
      await fetchWithPolicy(
        makePolicy(),
        'https://api.test',
        undefined,
        fetchMock as unknown as typeof globalThis.fetch,
      ),
    ).toBe('body');
  });

  it('applies a default timeout signal', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse());

    await fetchWithPolicy(
      makePolicy(),
      'https://api.test',
      undefined,
      fetchMock as unknown as typeof globalThis.fetch,
    );

    const init = fetchMock.mock.calls[0][1];
    expect(init?.signal).toBeDefined();
  });

  it('passes request options through', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse());

    await fetchWithPolicy(
      makePolicy(),
      'https://api.test',
      { method: 'POST', body: '{"x":1}' },
      fetchMock as unknown as typeof globalThis.fetch,
    );

    const init = fetchMock.mock.calls[0][1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"x":1}');
    expect(init?.signal).toBeDefined();
  });

  it('preserves a caller-provided signal', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse());
    const controller = new AbortController();

    await fetchWithPolicy(
      makePolicy(),
      'https://api.test',
      { signal: controller.signal },
      fetchMock as unknown as typeof globalThis.fetch,
    );

    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it('defaults to globalThis.fetch', async () => {
    const fetchStub = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse() as unknown as Response);
    try {
      expect(await fetchWithPolicy(makePolicy(), 'https://api.test')).toBe(
        'body',
      );
    } finally {
      fetchStub.mockRestore();
    }
  });

  it('throws a policy error with the status and Retry-After', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(statusResponse(400, { 'Retry-After': '3' }));

    let caught: unknown;
    try {
      await fetchWithPolicy(
        makePolicy(),
        'https://api.test',
        undefined,
        fetchMock as unknown as typeof globalThis.fetch,
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ httpStatus: 400, retryAfterMs: 3000 });
  });

  it('retries a non-2xx response and succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(statusResponse(503))
      .mockResolvedValueOnce(okResponse());

    expect(
      await fetchWithPolicy(
        makePolicy(),
        'https://api.test',
        undefined,
        fetchMock as unknown as typeof globalThis.fetch,
      ),
    ).toBe('body');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 4xx response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(statusResponse(404));

    let caught: unknown;
    try {
      await fetchWithPolicy(
        makePolicy(),
        'https://api.test',
        undefined,
        fetchMock as unknown as typeof globalThis.fetch,
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ httpStatus: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a default per-attempt timeout and succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(
        new DOMException('The operation timed out.', 'TimeoutError'),
      )
      .mockResolvedValueOnce(okResponse());

    expect(
      await fetchWithPolicy(
        makePolicy(),
        'https://api.test',
        undefined,
        fetchMock as unknown as typeof globalThis.fetch,
      ),
    ).toBe('body');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry caller cancellation during fetch and restores the caller reason', async () => {
    const controller = new AbortController();
    const callerReason = new DOMException(
      'Caller timed out',
      FetchPolicyErrorName.Timeout,
    );
    const fetchMock = jest.fn().mockImplementation(async () => {
      controller.abort(callerReason);
      throw callerReason;
    });

    let caught: unknown;
    try {
      await fetchWithPolicy(
        makePolicy(),
        'https://api.test',
        { signal: controller.signal },
        fetchMock as unknown as typeof globalThis.fetch,
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(callerReason);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry caller cancellation during body reading and restores the caller reason', async () => {
    const controller = new AbortController();
    const callerReason = new Error('Caller cancelled while reading body');
    const fetchMock = jest.fn().mockResolvedValue({
      ...okResponse(),
      text: async () => {
        controller.abort(callerReason);
        throw callerReason;
      },
    });

    let caught: unknown;
    try {
      await fetchWithPolicy(
        makePolicy(),
        'https://api.test',
        { signal: controller.signal },
        fetchMock as unknown as typeof globalThis.fetch,
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(callerReason);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the normalized abort error when a custom aborted signal has no reason', async () => {
    const customSignal = { aborted: true, reason: undefined } as AbortSignal;
    const fetchMock = jest
      .fn()
      .mockRejectedValue(new Error('Request aborted without reason'));

    let caught: unknown;
    try {
      await fetchWithPolicy(
        makePolicy(),
        'https://api.test',
        { signal: customSignal },
        fetchMock as unknown as typeof globalThis.fetch,
      );
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).name).toBe('AbortError');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
