import { SnapError, UserRejectedRequestError } from '@metamask/snaps-sdk';

import { mockLogger } from '../logger/__mocks__/Logger.js';
import type { TrackErrorFn } from './errors.js';
import { createSnapErrorHandling, createTrackError } from './trackError.js';
import type { TrackErrorCapableProvider } from './trackError.js';

const setupTrackErrorTest = (): {
  request: jest.Mock;
  trackError: TrackErrorFn;
} => {
  jest.clearAllMocks();

  const request = jest.fn();
  const getSnapProvider = (): TrackErrorCapableProvider => ({ request });
  const trackError = createTrackError({
    getSnapProvider,
    logError: mockLogger.error.bind(mockLogger),
  });

  return { request, trackError };
};

describe('trackError', () => {
  describe('createTrackError', () => {
    it('does not track UserRejectedRequestError', async () => {
      const { request, trackError } = setupTrackErrorTest();

      expect(await trackError(new UserRejectedRequestError())).toBeUndefined();

      expect(request).not.toHaveBeenCalled();
    });

    it('tracks errors and returns the Sentry event id', async () => {
      const { request, trackError } = setupTrackErrorTest();
      const originalError = new Error('Test error');
      request.mockResolvedValue('tracked-error-id');

      expect(await trackError(originalError)).toBe('tracked-error-id');

      expect(request).toHaveBeenCalledWith({
        method: 'snap_trackError',
        params: {
          error: expect.objectContaining({
            message: originalError.message,
          }),
        },
      });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('does not throw when tracking fails', async () => {
      const { request, trackError } = setupTrackErrorTest();
      const originalError = new Error('Test error');
      const trackingError = new Error('Tracking failed');
      request.mockRejectedValue(trackingError);

      expect(await trackError(originalError)).toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: trackingError },
        'Failed to track error',
      );
    });

    it('uses prepareError before serializing', async () => {
      const request = jest.fn().mockResolvedValue('tracked-error-id');
      const prepareError = jest.fn(
        (error: unknown): Error => new Error(`wrapped: ${String(error)}`),
      );
      const getSnapProvider = (): TrackErrorCapableProvider => ({ request });
      const trackError = createTrackError({
        getSnapProvider,
        logError: mockLogger.error.bind(mockLogger),
        prepareError,
      });

      await trackError('raw error');

      expect(prepareError).toHaveBeenCalledWith('raw error');
      expect(request).toHaveBeenCalledWith({
        method: 'snap_trackError',
        params: {
          error: expect.objectContaining({
            message: 'wrapped: raw error',
          }),
        },
      });
    });

    it('uses shouldTrack to skip tracking', async () => {
      const request = jest.fn();
      const getSnapProvider = (): TrackErrorCapableProvider => ({ request });
      const trackError = createTrackError({
        getSnapProvider,
        logError: mockLogger.error.bind(mockLogger),
        shouldTrack: (error: unknown): boolean => error instanceof SnapError,
      });

      expect(await trackError(new Error('ignored'))).toBeUndefined();
      expect(request).not.toHaveBeenCalled();

      request.mockResolvedValue('tracked-error-id');
      expect(await trackError(new SnapError('tracked'))).toBe(
        'tracked-error-id',
      );
    });

    it('coerces non-Error values with the default prepareError', async () => {
      const { request, trackError } = setupTrackErrorTest();
      request.mockResolvedValue('tracked-error-id');

      expect(await trackError('string error')).toBe('tracked-error-id');

      expect(request).toHaveBeenCalledWith({
        method: 'snap_trackError',
        params: {
          error: expect.objectContaining({
            cause: expect.objectContaining({
              message: 'string error',
            }),
          }),
        },
      });
    });

    it('resolves the snap provider on each call', async () => {
      const firstRequest = jest.fn().mockResolvedValue('first-id');
      const secondRequest = jest.fn().mockResolvedValue('second-id');
      const getSnapProvider = jest
        .fn()
        .mockReturnValueOnce({ request: firstRequest })
        .mockReturnValueOnce({ request: secondRequest });
      const trackError = createTrackError({
        getSnapProvider,
        logError: mockLogger.error.bind(mockLogger),
      });

      expect(await trackError(new Error('first'))).toBe('first-id');
      expect(await trackError(new Error('second'))).toBe('second-id');
      expect(getSnapProvider).toHaveBeenCalledTimes(2);
    });
  });

  describe('createSnapErrorHandling', () => {
    it('wires trackError into withCatchAndThrowSnapError', async () => {
      jest.clearAllMocks();

      const request = jest.fn().mockResolvedValue('tracked-error-id');
      const getSnapProvider = (): TrackErrorCapableProvider => ({ request });
      const { trackError, withCatchAndThrowSnapError } =
        createSnapErrorHandling({
          getSnapProvider,
          logError: mockLogger.error.bind(mockLogger),
        });

      const originalError = new Error('Test error');
      const mockFn = jest.fn().mockRejectedValue(originalError);

      await expect(withCatchAndThrowSnapError(mockFn)).rejects.toThrow(
        SnapError,
      );

      expect(request).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(await trackError(originalError)).toBe('tracked-error-id');
    });

    it('forwards prepareError and shouldTrack to trackError', async () => {
      jest.clearAllMocks();

      const request = jest.fn().mockResolvedValue('tracked-error-id');
      const getSnapProvider = (): TrackErrorCapableProvider => ({ request });
      const prepareError = jest.fn(
        (error: unknown): Error => new Error(`prepared: ${String(error)}`),
      );
      const shouldTrack = jest.fn(
        (error: unknown): boolean => error instanceof Error,
      );
      const { trackError } = createSnapErrorHandling({
        getSnapProvider,
        logError: mockLogger.error.bind(mockLogger),
        prepareError,
        shouldTrack,
      });

      expect(await trackError('skip me')).toBeUndefined();
      expect(shouldTrack).toHaveBeenCalledWith('skip me');
      expect(prepareError).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();

      expect(await trackError(new Error('track me'))).toBe('tracked-error-id');
      expect(prepareError).toHaveBeenCalledWith(expect.any(Error));
      expect(request).toHaveBeenCalledTimes(1);
    });

    it('uses a custom normalizeErrorFn in withCatchAndThrowSnapError', async () => {
      jest.clearAllMocks();

      const request = jest.fn().mockResolvedValue('tracked-error-id');
      const getSnapProvider = (): TrackErrorCapableProvider => ({ request });
      const normalizeErrorFn = jest.fn(
        () => new UserRejectedRequestError('normalized'),
      );
      const { withCatchAndThrowSnapError } = createSnapErrorHandling({
        getSnapProvider,
        logError: mockLogger.error.bind(mockLogger),
        normalizeErrorFn,
      });

      await expect(
        withCatchAndThrowSnapError(async () => {
          throw new Error('original');
        }),
      ).rejects.toThrow(UserRejectedRequestError);

      expect(normalizeErrorFn).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'original' }),
      );
      expect(request).toHaveBeenCalledTimes(1);
    });

    it('uses a custom logError override in withCatchAndThrowSnapError', async () => {
      jest.clearAllMocks();

      const request = jest.fn().mockResolvedValue('tracked-error-id');
      const getSnapProvider = (): TrackErrorCapableProvider => ({ request });
      const customLogError = jest.fn();
      const { withCatchAndThrowSnapError } = createSnapErrorHandling({
        getSnapProvider,
        logError: mockLogger.error.bind(mockLogger),
      });
      const originalError = new Error('Test error');

      await expect(
        withCatchAndThrowSnapError(async () => {
          throw originalError;
        }, customLogError),
      ).rejects.toThrow(SnapError);

      expect(customLogError).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });
});
