import { BrokenCircuitError } from '@metamask/snap-networks-utils';
import { SnapError, UserRejectedRequestError } from '@metamask/snaps-sdk';

import { shouldTrack, trackError, withCatchAndThrowSnapError } from './errors';
import {
  ACCOUNT_INFO_FETCH_FAILED_MESSAGE,
  FAILURE_STREAK_REMINDER_MS,
  failureStreakGate,
} from './failureStreakGate';
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

    it('does not track the open-circuit short-circuit, even wrapped (v5)', async () => {
      const { mockSnapRequest } = setupTest();

      expect(await trackError(new BrokenCircuitError())).toBeUndefined();
      expect(
        await trackError(
          new Error('Failed to fetch account info', {
            cause: new BrokenCircuitError(),
          }),
        ),
      ).toBeUndefined();

      expect(mockSnapRequest).not.toHaveBeenCalled();
    });

    it('does not track the open-circuit error rethrown as a plain Error by the keyring SDK (v6)', async () => {
      const { mockSnapRequest } = setupTest();

      // The onboarding event: `handleKeyringRequest` rethrew the
      // `BrokenCircuitError` as `new Error(message)`, and the handler wrapper
      // tracked it.
      await expect(
        withCatchAndThrowSnapError(async () => {
          throw new Error(
            'Execution prevented because the circuit breaker is open',
          );
        }),
      ).rejects.toThrow('circuit breaker is open');

      expect(mockSnapRequest).not.toHaveBeenCalled();
    });

    it('tracks "Failed to fetch account info" once per failure streak (v6)', async () => {
      const { mockSnapRequest } = setupTest();
      mockSnapRequest.mockResolvedValue('id');
      failureStreakGate.clear();
      let now = 5_000_000;
      const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
      const fail = async (): Promise<void> =>
        withCatchAndThrowSnapError(async () => {
          // What reaches the wrapper from a keyring call.
          throw new Error(ACCOUNT_INFO_FETCH_FAILED_MESSAGE);
        }).catch(() => undefined);

      try {
        await fail();
        now += 15_000;
        await fail();
        now += 15_000;
        await fail();
        expect(mockSnapRequest).toHaveBeenCalledTimes(1);

        // Still failing after the reminder interval: reported again.
        now += FAILURE_STREAK_REMINDER_MS;
        await fail();
        expect(mockSnapRequest).toHaveBeenCalledTimes(2);

        // A success ends the streak: the next failure is reported.
        failureStreakGate.endStreak(ACCOUNT_INFO_FETCH_FAILED_MESSAGE);
        await fail();
        expect(mockSnapRequest).toHaveBeenCalledTimes(3);
      } finally {
        dateSpy.mockRestore();
        failureStreakGate.clear();
      }
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

  describe('shouldTrack', () => {
    it('tracks other errors', () => {
      expect(shouldTrack(new Error('Failed to fetch account info'))).toBe(true);
    });

    it('skips user rejections and open-circuit errors', () => {
      expect(shouldTrack(new UserRejectedRequestError())).toBe(false);
      expect(
        shouldTrack(new Error('wrapped', { cause: new BrokenCircuitError() })),
      ).toBe(false);
    });
  });
});
