import { SnapError, UserRejectedRequestError } from '@metamask/snaps-sdk';

import { trackError, withCatchAndThrowSnapError } from './errors';
import { mockLogger } from './mockLogger';

jest.mock('./logger', () => ({
  __esModule: true,
  default: jest.requireActual('./mockLogger').mockLogger,
}));

const setupTest = (): { mockSnapRequest: jest.Mock } => {
  jest.clearAllMocks();

  const mockSnapRequest = jest.fn();
  Object.defineProperty(globalThis, 'snap', {
    configurable: true,
    value: { request: mockSnapRequest },
    writable: true,
  });

  return { mockSnapRequest };
};

describe('errors', () => {
  describe('trackError', () => {
    it('does not track UserRejectedRequestError', async () => {
      const { mockSnapRequest } = setupTest();

      expect(await trackError(new UserRejectedRequestError())).toBeUndefined();

      expect(mockSnapRequest).not.toHaveBeenCalled();
    });

    it('sanitizes errors before tracking', async () => {
      const { mockSnapRequest } = setupTest();
      mockSnapRequest.mockResolvedValue('tracked-error-id');

      await trackError(new Error('Failed to derive private key'));

      expect(mockSnapRequest).toHaveBeenCalledWith({
        method: 'snap_trackError',
        params: {
          error: expect.objectContaining({
            message:
              'Key derivation failed. Please check your connection and try again.',
          }),
        },
      });
    });
  });

  describe('withCatchAndThrowSnapError', () => {
    it('returns the result when the function succeeds', async () => {
      setupTest();

      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await withCatchAndThrowSnapError(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('tracks, logs, and re-throws errors as SnapError', async () => {
      const { mockSnapRequest } = setupTest();
      mockSnapRequest.mockResolvedValue('tracked-error-id');

      const originalError = new Error('Test error');
      const mockFn = jest.fn().mockRejectedValue(originalError);

      await expect(withCatchAndThrowSnapError(mockFn)).rejects.toThrow(
        SnapError,
      );

      expect(mockSnapRequest).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    it('skips tracking RPC for user rejections', async () => {
      const { mockSnapRequest } = setupTest();
      const mockFn = jest
        .fn()
        .mockRejectedValue(new UserRejectedRequestError());

      await expect(withCatchAndThrowSnapError(mockFn)).rejects.toThrow(
        UserRejectedRequestError,
      );

      expect(mockSnapRequest).not.toHaveBeenCalled();
    });
  });
});
