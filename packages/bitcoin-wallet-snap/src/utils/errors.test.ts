import { UserRejectedRequestError } from '@metamask/snaps-sdk';

import {
  BalanceNotSynchronizedError,
  BalanceStaleError,
  UserActionError,
} from '../entities';
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

    it('returns false for the "not synchronized yet" state however it was wrapped (v3)', () => {
      const original = new BalanceNotSynchronizedError();
      // As re-created by the keyring SDK's handleKeyringRequest.
      expect(shouldTrackError(new Error(original.message))).toBe(false);
      expect(shouldTrackError(original)).toBe(false);
      expect(
        shouldTrackError(new Error('Snap request failed', { cause: original })),
      ).toBe(false);
      // Serialized error object (e.g. after crossing the snap boundary).
      expect(
        shouldTrackError({ name: 'Error', message: original.message }),
      ).toBe(false);
      expect(shouldTrackError(new Error('Failed to fetch'))).toBe(true);
    });

    it('returns false for the stale-balance state however it was wrapped (v6)', () => {
      const original = new BalanceStaleError();
      expect(shouldTrackError(original)).toBe(false);
      // As re-created by the keyring SDK's handleKeyringRequest.
      expect(shouldTrackError(new Error(original.message))).toBe(false);
      expect(
        shouldTrackError(new Error('Snap request failed', { cause: original })),
      ).toBe(false);
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
