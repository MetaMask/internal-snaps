import { expect } from '@jest/globals';
import { SnapError, UserRejectedRequestError } from '@metamask/snaps-sdk';

import { trackError, withCatchAndThrowSnapError } from './errors';
import logger from './logger';

jest.mock('./logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
}));

const setupTest = () => {
  jest.clearAllMocks();

  const mockSnapRequest = jest.fn();
  (globalThis as any).snap = {
    request: mockSnapRequest,
  };

  return { mockSnapRequest, mockLogger: jest.mocked(logger) };
};

describe('errors', () => {
  describe('trackError', () => {
    it('does not track UserRejectedRequestError', async () => {
      const { mockSnapRequest } = setupTest();

      expect(
        await trackError(new UserRejectedRequestError()),
      ).toBeUndefined();

      expect(mockSnapRequest).not.toHaveBeenCalled();
    });

    it('does not throw if error tracking fails', async () => {
      const { mockLogger, mockSnapRequest } = setupTest();

      const originalError = new Error('Test error');
      const trackingError = new Error('Tracking failed');
      mockSnapRequest.mockRejectedValue(trackingError);

      expect(await trackError(originalError)).toBeUndefined();

      expect(mockSnapRequest).toHaveBeenCalledWith({
        method: 'snap_trackError',
        params: {
          error: expect.objectContaining({
            message: originalError.message,
          }),
        },
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        {
          error: trackingError,
        },
        'Failed to track error',
      );
    });

    it('tracks errors', async () => {
      const { mockLogger, mockSnapRequest } = setupTest();

      const originalError = new Error('Test error');
      mockSnapRequest.mockResolvedValue('tracked-error-id');

      expect(await trackError(originalError)).toBe('tracked-error-id');

      expect(mockSnapRequest).toHaveBeenCalledWith({
        method: 'snap_trackError',
        params: {
          error: expect.objectContaining({
            message: originalError.message,
          }),
        },
      });
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('withCatchAndThrowSnapError', () => {
    it('returns the result when the function succeeds', async () => {
      const { mockLogger } = setupTest();

      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await withCatchAndThrowSnapError(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('tracks and re-throws errors as SnapError', async () => {
      const { mockLogger, mockSnapRequest } = setupTest();
      mockSnapRequest.mockResolvedValue('tracked-error-id');

      const originalError = new Error('Test error');
      const mockFn = jest.fn().mockRejectedValue(originalError);

      await expect(withCatchAndThrowSnapError(mockFn)).rejects.toThrow(
        SnapError,
      );

      expect(mockSnapRequest).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });
  });
});
