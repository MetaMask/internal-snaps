import { string, type } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

import {
  SecurityAlertsApiClient,
  SecurityAlertsHttpError,
  SECURITY_ALERTS_REQUEST_HEADERS,
} from './SecurityAlertsApiClient';

const SCAN_URL = 'https://security-alerts.example/tron/transaction/scan';

const FakeResponseStruct = type({ verdict: string() });
type FakeResponse = Infer<typeof FakeResponseStruct>;

describe('SecurityAlertsApiClient', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof globalThis.fetch>;

  const responseWith = (overrides: Partial<Response> = {}): Response =>
    ({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ verdict: 'Benign' }),
      text: jest.fn().mockResolvedValue('response body'),
      ...overrides,
    }) as unknown as Response;

  const createClient = (): SecurityAlertsApiClient =>
    new SecurityAlertsApiClient({ scanUrl: SCAN_URL, fetch: fetchMock });

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
    const client = createClient();

    await client.scanTransaction(
      { transaction: 'fake-transaction', options: ['validation'] },
      FakeResponseStruct,
    );

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
    const client = new SecurityAlertsApiClient({ scanUrl: SCAN_URL });

    await client.scanTransaction(
      { transaction: 'fake-transaction', options: ['validation'] },
      FakeResponseStruct,
    );

    expect(globalFetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns the response validated by the response struct', async () => {
    fetchMock.mockResolvedValue(responseWith());
    const client = createClient();

    // Annotating proves `ResponseT` is inferred from the struct.
    const result: FakeResponse = await client.scanTransaction(
      { transaction: 'fake-transaction', options: ['validation'] },
      FakeResponseStruct,
    );

    expect(result).toStrictEqual({ verdict: 'Benign' });
  });

  it('throws when the response does not match the response struct', async () => {
    fetchMock.mockResolvedValue(responseWith({ json: jest.fn() }));
    const client = createClient();

    await expect(
      client.scanTransaction(
        { transaction: 'fake-transaction', options: ['validation'] },
        FakeResponseStruct,
      ),
    ).rejects.toThrow('Expected an object, but received: undefined');
  });

  it('throws a SecurityAlertsHttpError carrying the status and response body on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(
      responseWith({
        ok: false,
        status: 503,
        text: jest.fn().mockResolvedValue('service unavailable'),
      }),
    );
    const client = createClient();

    const error = await client
      .scanTransaction(
        { transaction: 'fake-transaction', options: ['validation'] },
        FakeResponseStruct,
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SecurityAlertsHttpError);
    expect(error).toMatchObject({
      name: 'SecurityAlertsHttpError',
      message: 'Security Alerts API error: 503 - service unavailable',
      statusCode: 503,
      responseBody: 'service unavailable',
    });
  });

  it('carries a null response body when the error body cannot be read', async () => {
    fetchMock.mockResolvedValue(
      responseWith({
        ok: false,
        status: 500,
        text: jest.fn().mockRejectedValue(new Error('stream consumed')),
      }),
    );
    const client = createClient();

    const error = await client
      .scanTransaction(
        { transaction: 'fake-transaction', options: ['validation'] },
        FakeResponseStruct,
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SecurityAlertsHttpError);
    expect(error).toMatchObject({
      name: 'SecurityAlertsHttpError',
      message: 'Security Alerts API error: 500',
      statusCode: 500,
      responseBody: null,
    });
  });
});

describe('SecurityAlertsHttpError', () => {
  it('omits the body from the message when there is none', () => {
    const error = new SecurityAlertsHttpError(429, null);

    expect(error.message).toBe('Security Alerts API error: 429');
    expect(error.statusCode).toBe(429);
    expect(error.responseBody).toBeNull();
  });
});
