import {
  createFetchPolicy,
  createFetchPolicyError,
  executeWithFetchPolicy,
  FetchPolicyErrorName,
} from '@metamask/snap-networks-utils';

import { toFetchPolicyError } from './fetchPolicy';
import { mockLogger } from './mockLogger';

describe('toFetchPolicyError', () => {
  it('classifies non-errors as network failures', () => {
    const error = toFetchPolicyError('boom');

    expect(error.name).toBe(FetchPolicyErrorName.Network);
    expect(error.message).toBe('Network request failed');
    expect(error.cause).toBe('boom');
  });

  it('preserves policy-shaped HTTP errors', () => {
    const error = Object.assign(new Error('Bad request'), { httpStatus: 400 });

    expect(toFetchPolicyError(error)).toBe(error);
  });

  it('preserves policy network errors', () => {
    const error = createFetchPolicyError('Network failed', {
      name: FetchPolicyErrorName.Network,
    });

    expect(toFetchPolicyError(error)).toBe(error);
  });

  it('preserves policy timeouts', () => {
    const error = createFetchPolicyError('Timed out', {
      name: FetchPolicyErrorName.Timeout,
    });

    expect(toFetchPolicyError(error)).toBe(error);
  });

  it('extracts status and Retry-After from axios-style responses', () => {
    const error = Object.assign(new Error('Too Many Requests'), {
      response: {
        status: 429,
        headers: { 'retry-after': '5' },
      },
    });

    expect(toFetchPolicyError(error)).toMatchObject({
      httpStatus: 429,
      retryAfterMs: 5000,
      cause: error,
    });
  });

  it('maps axios ECONNABORTED errors to timeouts', () => {
    const error = Object.assign(new Error('timeout of 10000ms exceeded'), {
      code: 'ECONNABORTED',
    });

    const mapped = toFetchPolicyError(error);

    expect(mapped.name).toBe(FetchPolicyErrorName.Timeout);
    expect(mapped.cause).toBe(error);
  });

  it('classifies other errors as network failures', () => {
    const error = new TypeError('fetch failed');

    const mapped = toFetchPolicyError(error);

    expect(mapped.name).toBe(FetchPolicyErrorName.Network);
    expect(mapped.cause).toBe(error);
  });

  it('retries axios-style transient errors through executeWithFetchPolicy', async () => {
    const policy = createFetchPolicy({
      service: 'test',
      logger: mockLogger,
    });
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(
        Object.assign(new Error('timeout of 10000ms exceeded'), {
          code: 'ECONNABORTED',
        }),
      )
      .mockResolvedValue('ok');

    expect(
      await executeWithFetchPolicy(policy, operation, toFetchPolicyError),
    ).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
