import { CircuitState, ConstantBackoff } from '@metamask/base-data-service';
import type { ServicePolicy } from '@metamask/base-data-service';

import type { FetchPolicyAnalytics } from './createFetchPolicy';
import {
  BrokenCircuitError,
  createFetchPolicy,
  createFetchPolicyError,
  FetchPolicyErrorName,
  isReportedFetchPolicyError,
  isTransientError,
  MAX_RETRY_AFTER_MS,
} from './createFetchPolicy';
import { now } from './performanceShim';

const httpError = (httpStatus: number, retryAfterMs?: number): Error =>
  createFetchPolicyError(`HTTP ${httpStatus}`, { httpStatus, retryAfterMs });

const setup = (
  options: Partial<
    Omit<Parameters<typeof createFetchPolicy>[0], 'service' | 'analytics'>
  > = {},
): { policy: ServicePolicy; logger: { warn: jest.Mock } } => {
  const logger = { warn: jest.fn() };
  const policy = createFetchPolicy({
    service: 'test_api',
    chainIdCaip: 'tron:728126428',
    logger,
    backoff: new ConstantBackoff(0),
    ...options,
  });
  return { policy, logger };
};

/**
 * Builds a service that throws the given errors in order, then resolves.
 *
 * @param errors - The errors to throw on the first calls.
 * @returns The mocked service.
 */
const failingThen = (...errors: unknown[]): jest.Mock<Promise<string>, []> => {
  const service = jest.fn(async () => 'ok');
  for (const error of errors) {
    service.mockRejectedValueOnce(error);
  }
  return service;
};

describe('createFetchPolicyError', () => {
  it('creates an error with the given status, Retry-After, name and cause', () => {
    const cause = new Error('root');

    const error = createFetchPolicyError('Too many requests', {
      name: 'RateLimitError',
      httpStatus: 429,
      retryAfterMs: 1000,
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Too many requests');
    expect(error.name).toBe('RateLimitError');
    expect(error.httpStatus).toBe(429);
    expect(error.retryAfterMs).toBe(1000);
    expect(error.cause).toBe(cause);
  });

  it('creates a plain error when no fields are given', () => {
    const error = createFetchPolicyError('boom');

    expect(error.name).toBe('Error');
    expect(error.message).toBe('boom');
  });

  it('leaves out the fields that are not given', () => {
    const error = createFetchPolicyError('Failed to fetch', {
      name: FetchPolicyErrorName.Network,
    });

    expect(error.name).toBe('NetworkError');
    expect(error).not.toHaveProperty('httpStatus');
    expect(error).not.toHaveProperty('retryAfterMs');
    expect(error).not.toHaveProperty('cause');
  });
});

describe('isTransientError', () => {
  it.each([408, 425, 429, 500, 502, 503, 504])(
    'treats HTTP %i as transient',
    (status) => {
      expect(isTransientError(httpError(status))).toBe(true);
    },
  );

  it.each([FetchPolicyErrorName.Network, FetchPolicyErrorName.Timeout])(
    'treats a %s as transient',
    (name) => {
      expect(isTransientError(createFetchPolicyError('boom', { name }))).toBe(
        true,
      );
    },
  );

  it.each([
    ['HTTP 400', httpError(400)],
    ['HTTP 404', httpError(404)],
    ['HTTP 501', httpError(501)],
    ['an abort', createFetchPolicyError('aborted', { name: 'AbortError' })],
    ['an error without status', new Error('invalid response')],
    ['a non-error value', 'boom'],
  ])('does not treat %s as transient', (_label, error) => {
    expect(isTransientError(error)).toBe(false);
  });
});

describe('createFetchPolicy', () => {
  it('returns the result of the service', async () => {
    const { policy } = setup();

    expect(await policy.execute(async () => 'ok')).toBe('ok');
  });

  it('opens the circuit for 30 seconds by default', () => {
    const { policy } = setup();

    expect(policy.circuitBreakDuration).toBe(30_000);
  });

  it.each([408, 425, 429, 500, 502, 503, 504])(
    'retries HTTP %i',
    async (status) => {
      const { policy } = setup();
      const service = failingThen(httpError(status));

      expect(await policy.execute(service)).toBe('ok');
      expect(service).toHaveBeenCalledTimes(2);
    },
  );

  it.each([FetchPolicyErrorName.Network, FetchPolicyErrorName.Timeout])(
    'retries a %s',
    async (name) => {
      const { policy } = setup();
      const service = failingThen(createFetchPolicyError('boom', { name }));

      expect(await policy.execute(service)).toBe('ok');
      expect(service).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    ['HTTP 400', httpError(400)],
    ['HTTP 403', httpError(403)],
    ['HTTP 404', httpError(404)],
    ['HTTP 501', httpError(501)],
    ['an abort', createFetchPolicyError('aborted', { name: 'AbortError' })],
    ['a validation error', new Error('invalid response')],
  ])('does not retry %s', async (_label, error) => {
    const { policy } = setup();
    const service = failingThen(error);

    await expect(policy.execute(service)).rejects.toBe(error);
    expect(service).toHaveBeenCalledTimes(1);
  });

  it('gives up after 3 retries and logs it', async () => {
    const { policy, logger } = setup();
    const error = httpError(503);
    const service = jest.fn().mockRejectedValue(error);

    await expect(policy.execute(service)).rejects.toBe(error);

    expect(service).toHaveBeenCalledTimes(4);
    expect(logger.warn).toHaveBeenCalledWith(
      '[test_api tron:728126428] Retrying (attempt 1, delay 0 ms):',
      error,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      '[test_api tron:728126428] Giving up:',
      error,
    );
  });

  it('logs without a chain when none is given', async () => {
    const { policy, logger } = setup({ chainIdCaip: undefined });
    const error = httpError(503);

    await expect(
      policy.execute(jest.fn().mockRejectedValue(error)),
    ).rejects.toBe(error);

    expect(logger.warn).toHaveBeenCalledWith('[test_api] Giving up:', error);
  });

  describe('Retry-After', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('waits for Retry-After when it is longer than the backoff', async () => {
      const { policy } = setup();
      const service = failingThen(httpError(429, 1000));

      const result = policy.execute(service);
      await jest.advanceTimersByTimeAsync(999);
      expect(service).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);

      expect(await result).toBe('ok');
      expect(service).toHaveBeenCalledTimes(2);
    });

    it('keeps the backoff when it is longer than Retry-After', async () => {
      const { policy } = setup({ backoff: new ConstantBackoff(500) });
      const service = failingThen(httpError(429, 100));

      const result = policy.execute(service);
      await jest.advanceTimersByTimeAsync(499);
      expect(service).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);

      expect(await result).toBe('ok');
    });

    it('applies Retry-After to each retry, not only the first', async () => {
      const { policy } = setup();
      const service = failingThen(httpError(429, 1000), httpError(429, 2000));

      const result = policy.execute(service);
      await jest.advanceTimersByTimeAsync(1000);
      expect(service).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(1999);
      expect(service).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(1);

      expect(await result).toBe('ok');
      expect(service).toHaveBeenCalledTimes(3);
    });

    it('waits with exponential backoff by default', async () => {
      const policy = createFetchPolicy({
        service: 'test_api',
        logger: { warn: jest.fn() },
      });
      const service = failingThen(httpError(503));

      const result = policy.execute(service);
      expect(service).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(30_000);

      expect(await result).toBe('ok');
      expect(service).toHaveBeenCalledTimes(2);
    });

    it('does not retry when Retry-After is over the cap, and logs it', async () => {
      const { policy, logger } = setup();
      const error = httpError(429, MAX_RETRY_AFTER_MS + 1);
      const service = failingThen(error);

      await expect(policy.execute(service)).rejects.toBe(error);
      expect(service).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        '[test_api tron:728126428] Not retrying: Retry-After of 30001 ms is over the 30000 ms cap:',
        error,
      );
    });
  });

  describe('circuit breaker', () => {
    it.each([
      ['repeated 429s', httpError(429)],
      ['a non-retried 5xx', httpError(501)],
      [
        'network errors',
        createFetchPolicyError('boom', { name: FetchPolicyErrorName.Network }),
      ],
    ])('opens on %s and logs it', async (_label, error) => {
      const { policy, logger } = setup({
        maxRetries: 0,
        maxConsecutiveFailures: 2,
      });
      const service = jest.fn().mockRejectedValue(error);

      await expect(policy.execute(service)).rejects.toBe(error);
      await expect(policy.execute(service)).rejects.toBe(error);
      await expect(policy.execute(service)).rejects.toBeInstanceOf(
        BrokenCircuitError,
      );

      expect(service).toHaveBeenCalledTimes(2);
      expect(policy.getCircuitState()).toBe(CircuitState.Open);
      expect(logger.warn).toHaveBeenCalledWith(
        '[test_api tron:728126428] Circuit opened for 30000 ms:',
        error,
      );
    });

    it('logs a circuit opened without an error, e.g. by isolate()', () => {
      const { policy, logger } = setup();

      policy.circuitBreakerPolicy.isolate();

      expect(logger.warn).toHaveBeenCalledWith(
        '[test_api tron:728126428] Circuit opened for 30000 ms',
      );
    });

    it.each([
      ['HTTP 400', httpError(400)],
      ['HTTP 404', httpError(404)],
      ['an abort', createFetchPolicyError('aborted', { name: 'AbortError' })],
      ['validation errors', new Error('invalid response')],
      ['non-error values', 'boom'],
    ])('stays closed on %s', async (_label, error) => {
      const { policy } = setup({ maxRetries: 0, maxConsecutiveFailures: 2 });
      const service = jest.fn().mockRejectedValue(error);

      for (let i = 0; i < 3; i++) {
        await expect(policy.execute(service)).rejects.toBe(error);
      }

      expect(service).toHaveBeenCalledTimes(3);
      expect(policy.getCircuitState()).toBe(CircuitState.Closed);
    });
  });
});

describe('createFetchPolicy observability', () => {
  const setupObserved = (
    options: Partial<Parameters<typeof createFetchPolicy>[0]> = {},
  ): {
    policy: ServicePolicy;
    logger: { warn: jest.Mock };
    analytics: {
      trackServiceDegraded: jest.Mock;
      trackServiceUnavailable: jest.Mock;
    };
    trackError: jest.Mock;
  } => {
    const logger = { warn: jest.fn() };
    const analytics = {
      trackServiceDegraded: jest.fn().mockResolvedValue(undefined),
      trackServiceUnavailable: jest.fn().mockResolvedValue(undefined),
    };
    const trackError = jest.fn().mockResolvedValue(undefined);
    const policy = createFetchPolicy({
      service: 'stellar_horizon',
      chainIdCaip: 'stellar:pubnet',
      logger,
      backoff: new ConstantBackoff(0),
      maxConsecutiveFailures: 100,
      analytics,
      trackError,
      ...options,
    } as Parameters<typeof createFetchPolicy>[0]);
    return { policy, logger, analytics, trackError };
  };

  // The rate limits and the circuit's half-open timer both read `Date.now()`.
  let clock = 0;
  const advanceClock = (ms: number): void => {
    clock += ms;
  };

  beforeEach(() => {
    clock = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('only accepts a schema service name when analytics is given', () => {
    const analytics = {
      trackServiceDegraded: jest.fn(),
      trackServiceUnavailable: jest.fn(),
    };

    expect(() =>
      // @ts-expect-error `esplora_bitcoin` is not a Segment schema service.
      createFetchPolicy({
        service: 'esplora_bitcoin',
        logger: { warn: jest.fn() },
        analytics,
      }),
    ).not.toThrow();
  });

  it('accepts analytics that may be undefined', () => {
    const analytics = undefined as FetchPolicyAnalytics | undefined;

    expect(() =>
      createFetchPolicy({
        service: 'price_api',
        logger: { warn: jest.fn() },
        analytics,
      }),
    ).not.toThrow();
  });

  it('tracks a call slower than 5 seconds as degraded', async () => {
    jest.useFakeTimers();
    const { policy, analytics } = setupObserved();

    const result = policy.execute(
      async () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('ok'), 6000);
        }),
    );
    await jest.advanceTimersByTimeAsync(6000);
    await result;
    jest.useRealTimers();

    expect(analytics.trackServiceDegraded).toHaveBeenCalledWith({
      service: 'stellar_horizon',
      chainIdCaip: 'stellar:pubnet',
      type: 'slow_success',
      durationMs: 6000,
    });
  });

  it.each([
    [
      'a network error',
      createFetchPolicyError('boom', { name: FetchPolicyErrorName.Network }),
      { retryReason: 'connection_failed' },
    ],
    [
      'a timeout',
      createFetchPolicyError('boom', { name: FetchPolicyErrorName.Timeout }),
      { retryReason: 'timed_out' },
    ],
    [
      'an HTTP 503',
      httpError(503),
      { retryReason: 'non_successful_http_status', httpStatus: 503 },
    ],
  ])(
    'tracks a give-up on %s as degraded and reports it once',
    async (_label, error, properties) => {
      const { policy, analytics, trackError } = setupObserved();

      await expect(
        policy.execute(jest.fn().mockRejectedValue(error)),
      ).rejects.toBe(error);

      expect(analytics.trackServiceDegraded).toHaveBeenCalledTimes(1);
      expect(analytics.trackServiceDegraded).toHaveBeenCalledWith({
        service: 'stellar_horizon',
        chainIdCaip: 'stellar:pubnet',
        type: 'retries_exhausted',
        ...properties,
      });
      expect(trackError).toHaveBeenCalledTimes(1);
    },
  );

  it('does not track or report non-retryable errors', async () => {
    const { policy, analytics, trackError } = setupObserved();
    const error = httpError(404);

    await expect(
      policy.execute(jest.fn().mockRejectedValue(error)),
    ).rejects.toBe(error);

    expect(analytics.trackServiceDegraded).not.toHaveBeenCalled();
    expect(trackError).not.toHaveBeenCalled();
  });

  it('reports a sanitized error without the original message, stack or cause', async () => {
    const { policy, trackError } = setupObserved();
    const error = createFetchPolicyError(
      'GET https://horizon.example/accounts/GABC?key=secret failed',
      { httpStatus: 503, cause: new Error('https://horizon.example') },
    );

    await expect(
      policy.execute(jest.fn().mockRejectedValue(error)),
    ).rejects.toBe(error);

    const tracked = trackError.mock.calls[0][0];
    expect(tracked).toBeInstanceOf(Error);
    expect(tracked).not.toBe(error);
    expect(tracked.name).toBe('FetchPolicyGiveUpError');
    expect(tracked.message).toBe(
      '[stellar_horizon stellar:pubnet] Gave up after retries: non_successful_http_status (HTTP 503)',
    );
    expect(tracked.cause).toBeUndefined();
    expect(tracked.stack).not.toContain('horizon.example');
  });

  it('does not report the original error name', async () => {
    const { policy, trackError } = setupObserved();
    const error = createFetchPolicyError('boom', {
      name: 'https://horizon.example?key=secret',
      httpStatus: 503,
    });

    await expect(
      policy.execute(jest.fn().mockRejectedValue(error)),
    ).rejects.toBe(error);

    expect(trackError.mock.calls[0][0].message).not.toContain('secret');
  });

  it('reports a network failure without a status', async () => {
    const { policy, trackError } = setupObserved();
    const error = createFetchPolicyError('boom', {
      name: FetchPolicyErrorName.Network,
    });

    await expect(
      policy.execute(jest.fn().mockRejectedValue(error)),
    ).rejects.toBe(error);

    expect(trackError.mock.calls[0][0].message).toBe(
      '[stellar_horizon stellar:pubnet] Gave up after retries: connection_failed',
    );
  });

  it('keeps the original error when trackError throws synchronously', async () => {
    const { policy, logger, trackError } = setupObserved();
    const trackingError = new Error('tracking failed');
    trackError.mockImplementation(() => {
      throw trackingError;
    });
    const error = httpError(503);

    await expect(
      policy.execute(jest.fn().mockRejectedValue(error)),
    ).rejects.toBe(error);
    await new Promise(setImmediate);

    expect(logger.warn).toHaveBeenCalledWith(
      '[stellar_horizon stellar:pubnet] Failed to report give-up:',
      trackingError,
    );
  });

  it('keeps a slow success when analytics throws synchronously', async () => {
    jest.useFakeTimers();
    const { policy, logger, analytics } = setupObserved();
    const trackingError = new Error('tracking failed');
    analytics.trackServiceDegraded.mockImplementation(() => {
      throw trackingError;
    });

    const result = policy.execute(
      async () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('ok'), 6000);
        }),
    );
    await jest.advanceTimersByTimeAsync(6000);

    expect(await result).toBe('ok');
    expect(logger.warn).toHaveBeenCalledWith(
      '[stellar_horizon stellar:pubnet] Failed to track service event:',
      trackingError,
    );
    jest.useRealTimers();
  });

  it('logs a failure to report the error', async () => {
    const { policy, logger, trackError } = setupObserved();
    const trackingError = new Error('tracking failed');
    trackError.mockRejectedValue(trackingError);

    await expect(
      policy.execute(jest.fn().mockRejectedValue(httpError(503))),
    ).rejects.toThrow('HTTP 503');
    await new Promise(setImmediate);

    expect(logger.warn).toHaveBeenCalledWith(
      '[stellar_horizon stellar:pubnet] Failed to report give-up:',
      trackingError,
    );
  });

  it('logs a failure to track a service event', async () => {
    const { policy, logger, analytics } = setupObserved({
      maxRetries: 0,
      maxConsecutiveFailures: 1,
    });
    const trackingError = new Error('tracking failed');
    analytics.trackServiceUnavailable.mockRejectedValue(trackingError);

    await expect(
      policy.execute(jest.fn().mockRejectedValue(httpError(503))),
    ).rejects.toThrow('HTTP 503');
    await new Promise(setImmediate);

    expect(logger.warn).toHaveBeenCalledWith(
      '[stellar_horizon stellar:pubnet] Failed to track service event:',
      trackingError,
    );
  });

  it('tracks degraded at most once a minute', async () => {
    const { policy, analytics, trackError } = setupObserved();
    const service = jest.fn().mockRejectedValue(httpError(503));

    await expect(policy.execute(service)).rejects.toThrow('HTTP 503');
    await expect(policy.execute(service)).rejects.toThrow('HTTP 503');
    expect(analytics.trackServiceDegraded).toHaveBeenCalledTimes(1);
    expect(trackError).toHaveBeenCalledTimes(2);

    advanceClock(60_000);
    await expect(policy.execute(service)).rejects.toThrow('HTTP 503');
    expect(analytics.trackServiceDegraded).toHaveBeenCalledTimes(2);
  });

  it('tracks unavailable when the circuit opens, at most once a minute', async () => {
    const { policy, analytics } = setupObserved({
      maxRetries: 0,
      maxConsecutiveFailures: 1,
    });
    const service = jest.fn().mockRejectedValue(httpError(503));

    await expect(policy.execute(service)).rejects.toThrow('HTTP 503');
    expect(analytics.trackServiceUnavailable).toHaveBeenCalledWith({
      service: 'stellar_horizon',
      chainIdCaip: 'stellar:pubnet',
      httpStatus: 503,
    });

    // A failed probe after the break reopens the circuit within the minute.
    advanceClock(30_000);
    await expect(policy.execute(service)).rejects.toThrow('HTTP 503');
    expect(service).toHaveBeenCalledTimes(2);
    expect(analytics.trackServiceUnavailable).toHaveBeenCalledTimes(1);

    advanceClock(30_000);
    await expect(policy.execute(service)).rejects.toThrow('HTTP 503');
    expect(analytics.trackServiceUnavailable).toHaveBeenCalledTimes(2);
  });

  it('rate-limits degraded and unavailable independently', async () => {
    const { policy, analytics } = setupObserved({
      maxRetries: 0,
      maxConsecutiveFailures: 2,
    });
    const service = jest.fn().mockRejectedValue(httpError(503));

    await expect(policy.execute(service)).rejects.toThrow('HTTP 503');
    await expect(policy.execute(service)).rejects.toThrow('HTTP 503');

    expect(analytics.trackServiceDegraded).toHaveBeenCalledTimes(1);
    expect(analytics.trackServiceUnavailable).toHaveBeenCalledTimes(1);
  });

  it('tracks unavailable without a status when the circuit is isolated', async () => {
    const { policy, analytics } = setupObserved({ chainIdCaip: undefined });

    policy.circuitBreakerPolicy.isolate();
    await new Promise(setImmediate);

    expect(analytics.trackServiceUnavailable).toHaveBeenCalledWith({
      service: 'stellar_horizon',
    });
  });

  describe('isReportedFetchPolicyError', () => {
    it('returns true for an error the policy reported', async () => {
      const { policy } = setupObserved();
      const error = httpError(503);

      await expect(
        policy.execute(jest.fn().mockRejectedValue(error)),
      ).rejects.toBe(error);

      expect(isReportedFetchPolicyError(error)).toBe(true);
      expect(
        isReportedFetchPolicyError(new Error('wrapped', { cause: error })),
      ).toBe(true);
    });

    it('returns true for an open-circuit rejection', () => {
      expect(isReportedFetchPolicyError(new BrokenCircuitError())).toBe(true);
    });

    it('returns false for an error the policy did not report', async () => {
      const { policy } = setupObserved({ trackError: undefined });
      const error = httpError(503);

      await expect(
        policy.execute(jest.fn().mockRejectedValue(error)),
      ).rejects.toBe(error);

      expect(isReportedFetchPolicyError(error)).toBe(false);
      expect(isReportedFetchPolicyError(httpError(404))).toBe(false);
      expect(isReportedFetchPolicyError('boom')).toBe(false);
    });
  });
});

describe('performance shim', () => {
  it('returns the current time', () => {
    jest.useFakeTimers({ now: 1_000 });

    expect(now()).toBe(1_000);

    jest.useRealTimers();
  });
});
