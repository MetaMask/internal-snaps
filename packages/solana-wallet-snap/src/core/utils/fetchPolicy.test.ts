import {
  createFetchPolicy,
  createFetchPolicyError,
  executeWithFetchPolicy,
  FetchPolicyErrorName,
  fetchWithPolicy,
} from '@metamask/snap-networks-utils';

import { install as installDOMExceptionPolyfill } from '../../polyfills/dom-exception';
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

    expect(
      await executeWithFetchPolicy(policy, operation, toFetchPolicyError),
    ).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry caller cancellation when the DOMException polyfill is installed', async () => {
    const originalDOMException = globalThis.DOMException;
    installDOMExceptionPolyfill();
    try {
      const policy = createFetchPolicy({
        service: 'test',
        logger: mockLogger,
      });
      const controller = new AbortController();
      const callerReason = new Error('Caller aborted request');
      const fetchMock = jest.fn().mockImplementation(async () => {
        controller.abort(callerReason);
        throw callerReason;
      });

      await expect(
        fetchWithPolicy(
          policy,
          'https://api.test',
          { signal: controller.signal },
          fetchMock as unknown as typeof globalThis.fetch,
        ),
      ).rejects.toBe(callerReason);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(globalThis, 'DOMException', {
        value: originalDOMException,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
  });
});
