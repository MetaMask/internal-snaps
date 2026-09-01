import { UserRejectedRequestError } from '@metamask/snaps-sdk';

import { UserActionError } from '../entities';
import { shouldTrackError, trackError } from './errors';
import logger from './logger';

jest.mock('./logger', () => ({
  error: jest.fn(),
}));

type SetupTestResult = {
  mockSnapRequest: jest.Mock;
  mockLogger: jest.Mocked<typeof logger>;
};

const setupTest = (): SetupTestResult => {
  jest.clearAllMocks();

  const mockSnapRequest = jest.fn();
  Object.defineProperty(globalThis, 'snap', {
    configurable: true,
    value: { request: mockSnapRequest },
    writable: true,
  });

  return { mockSnapRequest, mockLogger: jest.mocked(logger) };
};

describe('errors', () => {
  describe('shouldTrackError', () => {
    it('returns false for canceled confirmation errors', () => {
      expect(
        shouldTrackError(new UserActionError('User canceled the confirmation')),
      ).toBe(false);
    });

    it('returns false for UserRejectedRequestError', () => {
      expect(shouldTrackError(new UserRejectedRequestError())).toBe(false);
    });

    it('returns true for other errors', () => {
      expect(shouldTrackError(new Error('boom'))).toBe(true);
      expect(shouldTrackError(new UserActionError('Another user action'))).toBe(
        true,
      );
    });

    it('returns false and logs when error inspection fails', () => {
      const { mockLogger } = setupTest();
      const brokenError = {
        get message(): string {
          throw new Error('broken getter');
        },
      };

      expect(shouldTrackError(brokenError)).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'broken getter' }),
        'Failed to determine if error should be tracked',
      );
    });
  });

  describe('trackError', () => {
    it('does not track canceled confirmation UserActionError', async () => {
      const { mockSnapRequest } = setupTest();

      expect(
        await trackError(new UserActionError('User canceled the confirmation')),
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
        { error: trackingError },
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
});
