import { CircuitState, ConstantBackoff } from '@metamask/base-data-service';
import type { ServicePolicy } from '@metamask/base-data-service';

import {
  BrokenCircuitError,
  createFetchPolicy,
  createFetchPolicyError,
  FetchPolicyErrorName,
  isTransientError,
  MAX_RETRY_AFTER_MS,
} from './createFetchPolicy';
import { now } from './performanceShim';

const httpError = (httpStatus: number, retryAfterMs?: number): Error =>
  createFetchPolicyError(`HTTP ${httpStatus}`, { httpStatus, retryAfterMs });

const setup = (
  options: Partial<Parameters<typeof createFetchPolicy>[0]> = {},
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

describe('performance shim', () => {
  it('returns the current time', () => {
    jest.useFakeTimers({ now: 1_000 });

    expect(now()).toBe(1_000);

    jest.useRealTimers();
  });
});
