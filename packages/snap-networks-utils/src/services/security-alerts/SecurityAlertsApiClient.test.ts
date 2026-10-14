import { HttpError } from '../../utils/errors';
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

  const createClient = (): SecurityAlertsApiClient =>
    new SecurityAlertsApiClient({ scanUrl: SCAN_URL, fetch: fetchMock });

  const scan = (): Promise<unknown> =>
    createClient().scanTransaction({
      transaction: 'fake-transaction',
      options: ['validation'],
    });

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

    const error = await scan().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({
      name: 'HttpError',
      message: 'HTTP error! status: 503',
    });
  });

  it('throws an HttpError with the original error as cause when the request fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const error = await scan().catch((caught: unknown) => caught);

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

    const error = await scan().catch((caught: unknown) => caught);

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
