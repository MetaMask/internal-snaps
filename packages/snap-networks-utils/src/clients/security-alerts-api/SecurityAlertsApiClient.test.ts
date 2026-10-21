import { ConstantBackoff } from '@metamask/base-data-service';

import { HttpError } from '../../utils/errors';
import { createFetchPolicy } from '../../utils/fetchPolicy/createFetchPolicy';
import {
  SecurityAlertsApiClient,
  SECURITY_ALERTS_REQUEST_HEADERS,
} from './SecurityAlertsApiClient';

const SCAN_URL = 'https://security-alerts.example/tron/transaction/scan';

describe('SecurityAlertsApiClient', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof globalThis.fetch>;

  const responseWith = (overrides: Partial<Response> = {}): Response =>
    ({
      ok: true,
      status: 200,
      statusText: '',
      json: jest.fn().mockResolvedValue({ verdict: 'Benign' }),
      ...overrides,
    }) as unknown as Response;

  const createClient = (
    options: Partial<
      ConstructorParameters<typeof SecurityAlertsApiClient>[0]
    > = {},
  ): SecurityAlertsApiClient =>
    new SecurityAlertsApiClient({
      scanUrl: SCAN_URL,
      fetch: fetchMock,
      ...options,
    });

  const scan = (
    options: Partial<
      ConstructorParameters<typeof SecurityAlertsApiClient>[0]
    > = {},
  ): Promise<unknown> =>
    createClient(options).scanTransaction({
      transaction: 'fake-transaction',
      options: ['validation'],
    });

  const createPolicy = (): {
    logger: { warn: jest.Mock };
    policy: ReturnType<typeof createFetchPolicy>;
  } => {
    const logger = { warn: jest.fn() };
    return {
      logger,
      policy: createFetchPolicy({
        service: 'security_alerts_api',
        logger,
        backoff: new ConstantBackoff(0),
      }),
    };
  };

  const caughtError = async (promise: Promise<unknown>): Promise<unknown> => {
    try {
      await promise;
      return undefined;
    } catch (error) {
      return error;
    }
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects an invalid scan URL', () => {
    expect(() => new SecurityAlertsApiClient({ scanUrl: 'not-a-url' })).toThrow(
      'Invalid URL format',
    );
  });

  it('posts the body to the scan URL with the shared headers', async () => {
    fetchMock.mockResolvedValue(responseWith());

    await scan();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(SCAN_URL, {
      headers: {
        ...SECURITY_ALERTS_REQUEST_HEADERS,
      },
      method: 'POST',
      body: JSON.stringify({
        transaction: 'fake-transaction',
        options: ['validation'],
      }),
      signal: expect.any(AbortSignal),
    });
  });

  it('defaults to the global fetch when none is provided', async () => {
    const globalFetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(responseWith());
    await new SecurityAlertsApiClient({ scanUrl: SCAN_URL }).scanTransaction({
      transaction: 'fake-transaction',
      options: ['validation'],
    });

    expect(globalFetchSpy).toHaveBeenCalledTimes(1);

    globalFetchSpy.mockRestore();
  });

  it('retries transient network failures through the policy when one is provided', async () => {
    const { policy, logger } = createPolicy();
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue(responseWith());

    expect(await scan({ policy })).toStrictEqual({
      verdict: 'Benign',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('wraps exhausted network failures in an HttpError when a policy is provided', async () => {
    const { policy } = createPolicy();
    const fetchFailure = new TypeError('fetch failed', {
      cause: new Error('ECONNREFUSED'),
    });
    fetchMock.mockRejectedValue(fetchFailure);

    const error = await caughtError(scan({ policy }));

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({
      name: 'HttpError',
      message: 'Security Alerts API error',
      cause: fetchFailure,
    });
  });

  it('retries transient 503 responses through the policy when one is provided', async () => {
    const { policy, logger } = createPolicy();
    fetchMock
      .mockResolvedValueOnce(
        responseWith({ ok: false, status: 503, statusText: '' }),
      )
      .mockResolvedValue(responseWith());

    expect(await scan({ policy })).toStrictEqual({
      verdict: 'Benign',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not retry 400 responses through the policy when one is provided', async () => {
    const { policy } = createPolicy();
    fetchMock.mockResolvedValue(
      responseWith({ ok: false, status: 400, statusText: '' }),
    );

    const error = await caughtError(scan({ policy }));

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ message: 'HTTP error! status: 400' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries timeouts through the policy when one is provided', async () => {
    const { policy } = createPolicy();
    const timeout = Object.assign(new Error('The operation was aborted'), {
      name: 'TimeoutError',
    });
    fetchMock.mockRejectedValueOnce(timeout).mockResolvedValue(responseWith());

    expect(await scan({ policy })).toStrictEqual({
      verdict: 'Benign',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry malformed JSON responses through the policy when one is provided', async () => {
    const { policy, logger } = createPolicy();
    fetchMock
      .mockResolvedValueOnce(
        responseWith({
          json: jest
            .fn()
            .mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
        }),
      )
      .mockResolvedValue(responseWith());

    const error = await caughtError(scan({ policy }));

    expect(error).toBeInstanceOf(HttpError);
    expect((error as Error).cause).toBeInstanceOf(SyntaxError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not retry caller aborts through the policy when one is provided', async () => {
    const { policy, logger } = createPolicy();
    fetchMock
      .mockRejectedValueOnce(
        Object.assign(new Error('The operation was aborted'), {
          name: 'AbortError',
        }),
      )
      .mockResolvedValue(responseWith());

    const error = await caughtError(scan({ policy }));

    expect(error).toBeInstanceOf(HttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('returns the parsed response body', async () => {
    fetchMock.mockResolvedValue(responseWith());

    const result = await scan();

    expect(result).toStrictEqual({ verdict: 'Benign' });
  });

  it('throws an HttpError with the common status text on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(
      responseWith({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      }),
    );

    const error = await caughtError(scan());

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({
      name: 'HttpError',
      message: 'HTTP error! status: 503',
    });
  });

  it('throws an HttpError with the original error as cause when the request fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const error = await caughtError(scan());

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({
      name: 'HttpError',
      message: 'Security Alerts API error',
    });
    expect((error as Error).cause).toBeInstanceOf(TypeError);
  });

  it('throws an HttpError with the parse error as cause when the response body is not valid JSON', async () => {
    fetchMock.mockResolvedValue(
      responseWith({
        json: jest
          .fn()
          .mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
      }),
    );

    const error = await caughtError(scan());

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({
      name: 'HttpError',
      message: 'Security Alerts API error',
    });
    expect((error as Error).cause).toBeInstanceOf(SyntaxError);
  });
});

describe('HttpError', () => {
  it('carries an optional cause', () => {
    const cause = new Error('original error');
    const error = new HttpError('wrapped error', { cause });

    expect(error.name).toBe('HttpError');
    expect(error.message).toBe('wrapped error');
    expect(error.cause).toBe(cause);
  });
});
