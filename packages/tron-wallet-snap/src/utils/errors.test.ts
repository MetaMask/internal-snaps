import { SnapError, UserRejectedRequestError } from '@metamask/snaps-sdk';

import { withCatchAndThrowSnapError } from './errors';
import { mockLogger } from './mockLogger';

jest.mock('../clients/snap/SnapClient', () => {
  const trackError = jest.fn();

  return {
    trackError,
    SnapClient: jest.fn().mockImplementation(() => ({
      trackError,
    })),
  };
});

jest.mock('./logger', () => ({
  __esModule: true,
  default: jest.requireActual('./mockLogger').mockLogger,
}));

const { trackError } = jest.requireMock('../clients/snap/SnapClient');

describe('errors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('withCatchAndThrowSnapError', () => {
    it('returns the result when the function succeeds', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await withCatchAndThrowSnapError(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('tracks, logs, and re-throws errors as SnapError', async () => {
      const originalError = new Error('Test error');
      const mockFn = jest.fn().mockRejectedValue(originalError);

      await expect(withCatchAndThrowSnapError(mockFn)).rejects.toThrow(
        SnapError,
      );

      expect(trackError).toHaveBeenCalledWith(originalError);
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    it('delegates tracking to SnapClient for user rejections', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValue(new UserRejectedRequestError());

      await expect(withCatchAndThrowSnapError(mockFn)).rejects.toThrow(
        UserRejectedRequestError,
      );

      expect(trackError).toHaveBeenCalledWith(
        expect.any(UserRejectedRequestError),
      );
    });
  });
});
