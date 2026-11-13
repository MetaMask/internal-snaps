import { BrokenCircuitError } from '@metamask/snap-networks-utils';
import { SnapError, UserRejectedRequestError } from '@metamask/snaps-sdk';

import { trackError, withCatchAndThrowSnapError } from './errors';
import logger from './logger';

const setupTest = () => {
  vi.clearAllMocks();

  const mockSnapRequest = vi.fn();
  (globalThis as any).snap = {
    request: mockSnapRequest,
  };

  return { mockSnapRequest, mockLogger: vi.mocked(logger) };
};

describe('errors', () => {
  describe('trackError', () => {
    it('does not track UserRejectedRequestError', async () => {
      const { mockSnapRequest } = setupTest();

      expect(await trackError(new UserRejectedRequestError())).toBeUndefined();

      expect(mockSnapRequest).not.toHaveBeenCalled();
    });

    it('does not track errors the fetch policy already reported', async () => {
      const { mockSnapRequest } = setupTest();

      expect(await trackError(new BrokenCircuitError())).toBeUndefined();
      expect(
        await trackError(
          new Error('wrapped', { cause: new BrokenCircuitError() }),
        ),
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
      expect(mockLogger.error).toHaveBeenCalledWith(
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
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });

  describe('withCatchAndThrowSnapError', () => {
    it('returns the result when the function succeeds', async () => {
      const { mockLogger } = setupTest();

      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await withCatchAndThrowSnapError(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('tracks and re-throws errors as SnapError', async () => {
      const { mockLogger, mockSnapRequest } = setupTest();
      mockSnapRequest.mockResolvedValue('tracked-error-id');

      const originalError = new Error('Test error');
      const mockFn = vi.fn().mockRejectedValue(originalError);

      await expect(withCatchAndThrowSnapError(mockFn)).rejects.toThrow(
        SnapError,
      );

      expect(mockSnapRequest).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });
  });
});
