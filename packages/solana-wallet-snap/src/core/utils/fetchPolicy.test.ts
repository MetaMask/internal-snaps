import {
  createFetchPolicy,
  createFetchPolicyError,
  FetchPolicyErrorName,
} from '@metamask/snap-networks-utils';

import { mockLogger } from '../services/__mocks__/logger';
import { toFetchPolicyError } from './fetchPolicy';

describe('toFetchPolicyError', () => {
  it('preserves Solana HTTP transport metadata', () => {
    const error = new Error('HTTP request failed') as Error & {
      context: {
        headers: Pick<globalThis.Headers, 'get'>;
        statusCode: number;
      };
    };
    error.context = {
      headers: {
        get: jest.fn().mockReturnValue('3'),
      },
      statusCode: 429,
    };

    expect(toFetchPolicyError(error)).toMatchObject({
      httpStatus: 429,
      retryAfterMs: 3000,
    });
  });

  it('classifies transport errors as network failures', () => {
    expect(toFetchPolicyError(new TypeError('fetch failed')).name).toBe(
      FetchPolicyErrorName.Network,
    );
  });

  it('preserves policy-shaped HTTP errors', () => {
    const error = Object.assign(new Error('Bad request'), { httpStatus: 400 });

    expect(toFetchPolicyError(error)).toBe(error);
  });

  it('preserves policy timeouts', () => {
    const error = createFetchPolicyError('Timed out', {
      name: FetchPolicyErrorName.Timeout,
    });

    expect(toFetchPolicyError(error)).toBe(error);
  });

  it('classifies non-errors as network failures', () => {
    const error = toFetchPolicyError('boom');

    expect(error.name).toBe(FetchPolicyErrorName.Network);
    expect(error.message).toBe('Network request failed');
    expect(error.cause).toBe('boom');
  });

  it('maps raw timeouts', () => {
    const error = new Error('The operation was aborted due to timeout');
    error.name = FetchPolicyErrorName.Timeout;

    expect(toFetchPolicyError(error).name).toBe(FetchPolicyErrorName.Timeout);
  });

  it('extracts statuses from fetch-style responses', () => {
    const error = Object.assign(new Error('Unauthorized'), {
      response: {
        status: 401,
        headers: { 'retry-after': '5' },
      },
    });

    expect(toFetchPolicyError(error)).toMatchObject({
      httpStatus: 401,
      retryAfterMs: 5000,
    });
  });
});

describe('shared policy integration', () => {
  it('retries transport failures through the shared policy', async () => {
    const policy = createFetchPolicy({
      service: 'test',
      logger: mockLogger,
    });
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue('ok');

    const execute = async (): Promise<string> =>
      policy.execute(async () => {
        try {
          return await operation();
        } catch (error) {
          throw toFetchPolicyError(error);
        }
      });

    expect(await execute()).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
