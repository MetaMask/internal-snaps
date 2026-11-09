import {
  ChainDisconnectedError,
  DisconnectedError,
  InternalError,
  InvalidInputError,
  InvalidParamsError,
  InvalidRequestError,
  LimitExceededError,
  MethodNotFoundError,
  MethodNotSupportedError,
  ParseError,
  ResourceNotFoundError,
  ResourceUnavailableError,
  SnapError,
  TransactionRejected,
  UnauthorizedError,
  UnsupportedMethodError,
  UserRejectedRequestError,
} from '@metamask/snaps-sdk';
import type { Mock } from 'vitest';

import { mockLogger } from '../logger/__mocks__/Logger';
import { createWithCatchAndThrowSnapError, normalizeError } from './errors';
import type { CreateWithCatchAndThrowSnapErrorOptions } from './errors';
import { isSnapRpcError } from './snapRpcError';

type SetupTestResult = {
  trackError: Mock;
  withCatchAndThrowSnapError: ReturnType<
    typeof createWithCatchAndThrowSnapError
  >;
  createBoundWithCatchAndThrowSnapError: (
    options?: Omit<CreateWithCatchAndThrowSnapErrorOptions, 'logError'>,
  ) => ReturnType<typeof createWithCatchAndThrowSnapError>;
};

const setupTest = (): SetupTestResult => {
  vi.clearAllMocks();

  const trackError = vi.fn();
  const withCatchAndThrowSnapError = createWithCatchAndThrowSnapError({
    logError: mockLogger.error.bind(mockLogger),
    trackError,
  });

  return {
    trackError,
    withCatchAndThrowSnapError,
    createBoundWithCatchAndThrowSnapError: (
      options: Omit<CreateWithCatchAndThrowSnapErrorOptions, 'logError'> = {
        trackError,
      },
    ): ReturnType<typeof createWithCatchAndThrowSnapError> =>
      createWithCatchAndThrowSnapError({
        ...options,
        logError: mockLogger.error.bind(mockLogger),
      }),
  };
};

describe('errors', () => {
  describe('isSnapRpcError', () => {
    it.each([
      new SnapError('Test error'),
      new MethodNotFoundError(),
      new UserRejectedRequestError(),
      new MethodNotSupportedError(),
      new ParseError(),
      new ResourceNotFoundError(),
      new ResourceUnavailableError(),
      new TransactionRejected(),
      new ChainDisconnectedError(),
      new DisconnectedError(),
      new UnauthorizedError(),
      new UnsupportedMethodError(),
      new InternalError(),
      new InvalidInputError(),
      new InvalidParamsError(),
      new InvalidRequestError(),
      new LimitExceededError(),
    ])('returns true for Snap RPC errors', (error) => {
      expect(isSnapRpcError(error)).toBe(true);
    });

    it('returns false for generic errors', () => {
      expect(isSnapRpcError(new Error('Unexpected error'))).toBe(false);
    });

    it('returns false for non-error values', () => {
      expect(isSnapRpcError('string')).toBe(false);
      expect(isSnapRpcError(null)).toBe(false);
    });
  });

  describe('normalizeError', () => {
    it('preserves Snap RPC errors without wrapping', () => {
      const originalError = new UserRejectedRequestError();

      expect(normalizeError(originalError)).toBe(originalError);
    });

    it('wraps generic errors in SnapError', () => {
      const originalError = new Error('Test error');

      const normalized = normalizeError(originalError);

      expect(normalized).toBeInstanceOf(SnapError);
      expect(normalized.message).toBe('Test error');
    });

    it('wraps non-Error values in SnapError', () => {
      const normalized = normalizeError('string error');

      expect(normalized).toBeInstanceOf(SnapError);
      expect(normalized.message).toBe('string error');
    });
  });

  describe('createWithCatchAndThrowSnapError', () => {
    it('returns the result when the function succeeds', async () => {
      const { withCatchAndThrowSnapError } = setupTest();
      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await withCatchAndThrowSnapError(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('tracks, logs, and re-throws errors as SnapError', async () => {
      const { trackError, withCatchAndThrowSnapError } = setupTest();
      const originalError = new Error('Test error');
      const mockFn = vi.fn().mockRejectedValue(originalError);

      await expect(withCatchAndThrowSnapError(mockFn)).rejects.toThrow(
        SnapError,
      );

      expect(trackError).toHaveBeenCalledWith(originalError);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    it('preserves Snap RPC errors without wrapping', async () => {
      const { trackError, withCatchAndThrowSnapError } = setupTest();
      const originalError = new UserRejectedRequestError();
      const mockFn = vi.fn().mockRejectedValue(originalError);

      await expect(withCatchAndThrowSnapError(mockFn)).rejects.toThrow(
        UserRejectedRequestError,
      );

      expect(trackError).toHaveBeenCalledWith(originalError);
    });

    it('handles non-Error objects and converts them to SnapError', async () => {
      const { withCatchAndThrowSnapError } = setupTest();
      const mockFn = vi.fn().mockRejectedValue('string error');

      await expect(withCatchAndThrowSnapError(mockFn)).rejects.toThrow(
        SnapError,
      );

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    it('handles null errors', async () => {
      const { withCatchAndThrowSnapError } = setupTest();
      const mockFn = vi.fn().mockRejectedValue(null);

      await expect(withCatchAndThrowSnapError(mockFn)).rejects.toThrow(
        SnapError,
      );

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    it('preserves the original error message in the SnapError', async () => {
      const { withCatchAndThrowSnapError } = setupTest();
      const originalError = new Error('Custom error message');
      const mockFn = vi.fn().mockRejectedValue(originalError);

      await expect(withCatchAndThrowSnapError(mockFn)).rejects.toThrow(
        'Custom error message',
      );
    });

    it('uses a custom normalizeErrorFn when provided', async () => {
      const { trackError, createBoundWithCatchAndThrowSnapError } = setupTest();
      const customError = new MethodNotFoundError();
      const normalizeErrorFn = vi.fn().mockReturnValue(customError);
      const bound = createBoundWithCatchAndThrowSnapError({
        trackError,
        normalizeErrorFn,
      });
      const mockFn = vi.fn().mockRejectedValue(new Error('Test error'));

      await expect(bound(mockFn)).rejects.toThrow(MethodNotFoundError);

      expect(normalizeErrorFn).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Test error' }),
      );
    });

    it('uses a custom logError when provided', async () => {
      const { trackError, withCatchAndThrowSnapError } = setupTest();
      const customLogError = vi.fn();
      const originalError = new Error('Test error');
      const mockFn = vi.fn().mockRejectedValue(originalError);

      await expect(
        withCatchAndThrowSnapError(mockFn, customLogError),
      ).rejects.toThrow(SnapError);

      expect(customLogError).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(trackError).toHaveBeenCalledWith(originalError);
    });
  });
});
