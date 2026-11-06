import type { FetchPolicy } from '@metamask/snap-networks-utils';
import {
  createFetchPolicy,
  FetchPolicyErrorName,
} from '@metamask/snap-networks-utils';
import { NotFoundError } from '@stellar/stellar-sdk';

import { KnownHttpErrorCode, noOpLogger } from '../../utils';
import { generateStellarAddress } from '../wallet/__mocks__/wallet.fixtures';
import { HorizonClient, RpcClient } from './NetworkClient';

const HORIZON_URL = 'https://horizon.example.test';
const RPC_URL = 'https://rpc.example.test';
const TIMEOUT_MS = 100;

const createPolicy = (): FetchPolicy =>
  createFetchPolicy({
    service: 'stellar_rpc',
    logger: noOpLogger,
    // One attempt, so the assertion is the mapped error rather than a retry.
    maxRetries: 0,
  });

/**
 * Minimal response the SDK HTTP client can read: `status`, `ok`, `text()`, and
 * `headers`.
 *
 * @param body - JSON body.
 * @param status - HTTP status.
 * @param headers - Fetch-style lookup, or a plain header record.
 * @returns A fetch response stand-in.
 */
const httpResponse = (
  body: unknown,
  status = 200,
  headers: { get(name: string): string | null } | Record<string, string> = {
    get: () => null,
  },
): Awaited<ReturnType<typeof globalThis.fetch>> =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    headers,
    text: async () => JSON.stringify(body),
  }) as unknown as Awaited<ReturnType<typeof globalThis.fetch>>;

/**
 * Rejects when `fetch` is aborted, using the `TimeoutError` name feaxios maps
 * to `ECONNABORTED`.
 *
 * @param init - The request init passed to `fetch`.
 * @returns A promise that rejects once the abort signal fires.
 */
const rejectWhenAborted = (
  init: RequestInit | undefined,
): Promise<Awaited<ReturnType<typeof globalThis.fetch>>> => {
  const { signal } = init ?? {};
  return new Promise((_resolve, reject) => {
    const fail = (): void => {
      reject(
        new DOMException(
          'The operation was aborted due to timeout',
          'TimeoutError',
        ),
      );
    };

    if (!signal || signal.aborted) {
      fail();
      return;
    }

    signal.addEventListener('abort', fail, { once: true });
  });
};

const fetchHeaders = (
  value: string | null,
): { get(name: string): string | null } => ({
  get: (name) => (name.toLowerCase() === 'retry-after' ? value : null),
});

type FetchMock = (
  init: RequestInit | undefined,
) => Promise<Awaited<ReturnType<typeof globalThis.fetch>>>;

/**
 * One `#createPolicyError` input and the policy error it must become.
 *
 * `useNativeFetch` selects the SDK adapter that rethrows a fetch rejection
 * unchanged. The default adapter wraps that rejection and drops `code`.
 */
type HttpErrorTestCase = {
  title: string;
  mockFetch: FetchMock;
  useNativeFetch?: boolean;
  expected: {
    name?: string;
    message?: string;
    httpStatus?: number;
    retryAfterMs?: number;
    cause?: unknown;
  };
};

/**
 * Failures the default SDK adapter produces, plus the error shapes
 * `#createPolicyError` still classifies when an adapter throws them directly.
 */
const httpErrorTestCases: HttpErrorTestCase[] = [
  {
    title: 'an HTTP 400',
    mockFetch: async () => httpResponse({ message: 'bad request' }, 400),
    expected: { httpStatus: 400 },
  },
  {
    title: 'an HTTP 404',
    mockFetch: async () => httpResponse({}, 404),
    expected: { httpStatus: 404 },
  },
  {
    title: 'an HTTP 429 with a fetch-style Retry-After',
    mockFetch: async () => httpResponse({}, 429, fetchHeaders('1')),
    expected: { httpStatus: 429, retryAfterMs: 1000 },
  },
  {
    title: 'an HTTP 503 with a plain retry-after header',
    mockFetch: async () => httpResponse({}, 503, { 'retry-after': '2' }),
    expected: { httpStatus: 503, retryAfterMs: 2000 },
  },
  {
    title: 'an HTTP 503 with a plain Retry-After header',
    mockFetch: async () => httpResponse({}, 503, { 'Retry-After': '3' }),
    expected: { httpStatus: 503, retryAfterMs: 3000 },
  },
  {
    title: 'an HTTP 500 with an invalid Retry-After',
    mockFetch: async () => httpResponse({}, 500, fetchHeaders('later')),
    expected: { httpStatus: 500 },
  },
  {
    title: 'a client timeout',
    mockFetch: (init) => rejectWhenAborted(init),
    expected: {
      name: FetchPolicyErrorName.Timeout,
      cause: { code: KnownHttpErrorCode.ConnectionAborted },
    },
  },
  {
    title: 'a caller cancellation',
    mockFetch: async (): Promise<never> => {
      throw new DOMException('The operation was aborted', 'AbortError');
    },
    expected: {
      name: KnownHttpErrorCode.AbortError,
      cause: {
        name: KnownHttpErrorCode.CustomErrCanceled,
        code: KnownHttpErrorCode.Canceled,
      },
    },
  },
  {
    title: 'a transport failure',
    mockFetch: async (): Promise<never> => {
      throw new TypeError('Failed to fetch');
    },
    expected: {
      name: FetchPolicyErrorName.Network,
      message: 'Failed to fetch',
    },
  },
  {
    title: 'a thrown non-Error',
    useNativeFetch: true,
    mockFetch: () =>
      // The non-Error branch only runs when the adapter rejects with a non-Error.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject({ code: KnownHttpErrorCode.ConnectionAborted }),
    expected: {
      name: FetchPolicyErrorName.Network,
      message: 'Network request failed',
      cause: { code: KnownHttpErrorCode.ConnectionAborted },
    },
  },
  {
    title: 'an ETIMEDOUT error',
    useNativeFetch: true,
    mockFetch: async (): Promise<never> => {
      throw Object.assign(new Error('timed out'), {
        code: KnownHttpErrorCode.Timeout,
      });
    },
    expected: {
      name: FetchPolicyErrorName.Timeout,
      message: 'timed out',
    },
  },
  {
    title: 'an error named CanceledError',
    useNativeFetch: true,
    mockFetch: async (): Promise<never> => {
      const error = new Error('canceled');
      error.name = KnownHttpErrorCode.CustomErrCanceled;
      throw error;
    },
    expected: {
      name: KnownHttpErrorCode.AbortError,
      message: 'canceled',
    },
  },
  {
    title: 'an ERR_CANCELED error',
    useNativeFetch: true,
    mockFetch: async (): Promise<never> => {
      throw Object.assign(new Error('canceled'), {
        code: KnownHttpErrorCode.Canceled,
      });
    },
    expected: {
      name: KnownHttpErrorCode.AbortError,
      message: 'canceled',
    },
  },
];

/**
 * Posts once through the client's fetch policy and returns the rejection.
 *
 * @param client - Horizon or RPC client under test.
 * @param url - URL passed to the SDK HTTP client.
 * @param policyCase - The fetch failure and the flag for the pass-through adapter.
 * @param policyCase.mockFetch - Fetch implementation for this case.
 * @param policyCase.useNativeFetch - Selects the adapter that rethrows the rejection.
 * @returns The error the policy threw.
 */
const postAndGetError = async (
  client: HorizonClient | RpcClient,
  url: string,
  { mockFetch, useNativeFetch }: HttpErrorTestCase,
): Promise<unknown> => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) =>
    mockFetch(init),
  );

  return client.httpClient
    .post(url, {}, useNativeFetch ? { maxContentLength: 1 } : undefined)
    .catch((caught: unknown) => caught);
};

const fetchAndGetError = async (
  client: HorizonClient | RpcClient,
  url: string,
  { mockFetch, useNativeFetch }: HttpErrorTestCase,
): Promise<unknown> => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) =>
    mockFetch(init),
  );

  return client.httpClient
    .get(url, useNativeFetch ? { maxContentLength: 1 } : undefined)
    .catch((caught: unknown) => caught);
};

describe('HorizonClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('installs the request timeout on the SDK client', () => {
    const client = new HorizonClient(createPolicy(), HORIZON_URL, TIMEOUT_MS);

    expect(client.httpClient.defaults.timeout).toBe(TIMEOUT_MS);
  });

  it.each(httpErrorTestCases)('maps $title', async (policyCase) => {
    const postError = await postAndGetError(
      new HorizonClient(createPolicy(), HORIZON_URL, TIMEOUT_MS),
      HORIZON_URL,
      policyCase,
    );

    const fetchError = await fetchAndGetError(
      new HorizonClient(createPolicy(), HORIZON_URL, TIMEOUT_MS),
      HORIZON_URL,
      policyCase,
    );

    expect(postError).toMatchObject(policyCase.expected);
    expect(fetchError).toMatchObject(policyCase.expected);
    expect(
      (postError as { retryAfterMs?: number })?.retryAfterMs,
    ).toStrictEqual(policyCase.expected.retryAfterMs);
    expect(
      (fetchError as { retryAfterMs?: number })?.retryAfterMs,
    ).toStrictEqual(policyCase.expected.retryAfterMs);
  });

  it('turns a missing resource into NotFoundError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(httpResponse({}, 404));
    const client = new HorizonClient(createPolicy(), HORIZON_URL, TIMEOUT_MS);

    await expect(
      client.transactions().transaction('a'.repeat(64)).call(),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      client.accounts().accountId(generateStellarAddress()).call(),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(client.ledgers().ledger(1).call()).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('RpcClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('installs the request timeout on the SDK client', () => {
    const client = new RpcClient(createPolicy(), RPC_URL, TIMEOUT_MS);

    expect(client.httpClient.defaults.timeout).toBe(TIMEOUT_MS);
  });

  it.each(httpErrorTestCases)('maps $title', async (policyCase) => {
    const postError = await postAndGetError(
      new RpcClient(createPolicy(), RPC_URL, TIMEOUT_MS),
      RPC_URL,
      policyCase,
    );

    const fetchError = await fetchAndGetError(
      new RpcClient(createPolicy(), RPC_URL, TIMEOUT_MS),
      RPC_URL,
      policyCase,
    );

    expect(postError).toMatchObject(policyCase.expected);
    expect(postError).not.toHaveProperty('response');
    expect(fetchError).toMatchObject(policyCase.expected);
    expect(fetchError).not.toHaveProperty('response');
    expect(
      (postError as { retryAfterMs?: number })?.retryAfterMs,
    ).toStrictEqual(policyCase.expected.retryAfterMs);
    expect(
      (fetchError as { retryAfterMs?: number })?.retryAfterMs,
    ).toStrictEqual(policyCase.expected.retryAfterMs);
  });
});
