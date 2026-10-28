import { handleKeyringRequest } from '@metamask/keyring-snap-sdk/v2';
import type { GetPreferencesResult } from '@metamask/snaps-sdk';
import { mock } from 'jest-mock-extended';

import {
  BalanceNotSynchronizedError,
  BaseError,
  ExternalServiceError,
} from '../entities';
import type { Logger, SnapClient, Translator } from '../entities';
import { trackError } from '../utils/errors';
import { HandlerMiddleware } from './HandlerMiddleware';

jest.mock('../utils/errors', () => ({
  trackError: jest.fn(),
}));

describe('HandlerMiddleware', () => {
  const mockLogger = mock<Logger>();
  const mockSnapClient = mock<SnapClient>({
    getPreferences: jest.fn(),
  });
  const mockTranslator = mock<Translator>({
    load: jest.fn(),
  });
  const mockTrackError = jest.mocked(trackError);

  const middleware = new HandlerMiddleware(
    mockLogger,
    mockSnapClient,
    mockTranslator,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackError.mockResolvedValue(undefined);
    mockSnapClient.getPreferences.mockResolvedValue({
      locale: 'en',
    } as GetPreferencesResult);
    mockTranslator.load.mockResolvedValue({});
  });

  describe('handle', () => {
    it('executes the function successfully', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await middleware.handle(mockFn);

      expect(result).toBe('success');
    });

    it('wraps an unexpected Error and preserves its message', async () => {
      const error = new Error('boom');
      const mockFn = jest.fn().mockRejectedValue(error);

      await expect(middleware.handle(mockFn)).rejects.toThrow('boom');
      expect(mockSnapClient.getPreferences).toHaveBeenCalled();
      expect(mockTranslator.load).toHaveBeenCalledWith('en');
      expect(mockLogger.error).toHaveBeenCalledWith(error);
      expect(mockTrackError).toHaveBeenCalledWith(error);
    });

    it('tracks an unexpected Error before rethrowing it as a SnapError', async () => {
      const error = new Error('tracked boom');
      const mockFn = jest.fn().mockRejectedValue(error);

      await expect(middleware.handle(mockFn)).rejects.toThrow('tracked boom');
      expect(mockTrackError).toHaveBeenCalledWith(error);
    });

    it('continues to throw a SnapError when trackError is invoked', async () => {
      const error = new Error('boom after tracking failure');
      const mockFn = jest.fn().mockRejectedValue(error);

      await expect(middleware.handle(mockFn)).rejects.toThrow(error);

      expect(mockTrackError).toHaveBeenCalledWith(error);
      expect(mockSnapClient.getPreferences).toHaveBeenCalled();
    });

    it('wraps a non-Error thrown value by stringifying it', async () => {
      const mockFn = jest.fn().mockRejectedValue('string failure');

      await expect(middleware.handle(mockFn)).rejects.toThrow('string failure');
      expect(mockLogger.error).toHaveBeenCalledWith('string failure');
      expect(mockTrackError).toHaveBeenCalledWith('string failure');
    });

    it('wraps a thrown plain object by stringifying it', async () => {
      const thrown = { foo: 'bar' };
      const mockFn = jest.fn().mockRejectedValue(thrown);

      await expect(middleware.handle(mockFn)).rejects.toThrow(
        '[object Object]',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(thrown);
      expect(mockTrackError).toHaveBeenCalledWith(thrown);
    });

    it('uses the message property if it exists on a thrown plain object', async () => {
      const thrown = { message: 'InsufficientFunds', code: 11 };
      const mockFn = jest.fn().mockRejectedValue(thrown);

      await expect(middleware.handle(mockFn)).rejects.toThrow(
        'InsufficientFunds',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(thrown);
      expect(mockTrackError).toHaveBeenCalledWith(thrown);
    });

    it('handles error successfully if instance of BaseError', async () => {
      const error = new BaseError('Test error', 1);
      const mockFn = jest.fn().mockRejectedValue(error);
      mockTranslator.load.mockResolvedValue({
        'error.1': { message: 'Test error' },
      });

      await expect(middleware.handle(mockFn)).rejects.toThrow('Test error');
      expect(mockSnapClient.getPreferences).toHaveBeenCalled();
      expect(mockTranslator.load).toHaveBeenCalledWith('en');
      expect(mockLogger.error).toHaveBeenCalledWith(error, error.data);
      expect(mockTrackError).toHaveBeenCalledWith(error);
    });

    it('includes the concrete external service failure in the returned error message', async () => {
      const error = new ExternalServiceError('Failed to synchronize account', {
        account: 'account-1',
      });
      const mockFn = jest.fn().mockRejectedValue(error);
      mockTranslator.load.mockResolvedValue({
        'error.3000': { message: 'Connection error' },
      });

      await expect(middleware.handle(mockFn)).rejects.toThrow(
        'Connection error: Failed to synchronize account',
      );
      expect(mockTrackError).toHaveBeenCalledWith(error);
    });

    it('does not track or log as an error the expected "not synchronized yet" state', async () => {
      const error = new BalanceNotSynchronizedError({ account: 'account-1' });
      const mockFn = jest.fn().mockRejectedValue(error);
      mockTranslator.load.mockResolvedValue({
        'error.3000': { message: 'Connection error' },
      });

      await expect(middleware.handle(mockFn)).rejects.toThrow(
        'Connection error: Account balance unavailable: the account has not been synchronized yet',
      );
      expect(mockTrackError).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(error.message, error.data);
    });

    describe('through the real keyring request path (v3: the SDK re-creates the error)', () => {
      const balancesRequest = {
        jsonrpc: '2.0' as const,
        id: '1',
        method: 'keyring_getAccountBalances',
        params: {
          id: '9b1c3a4e-2f6d-4b8a-9c1e-5d7f3a2b1c0d',
          assets: ['bip122:000000000019d6689c085ae165831e93/slip44:0'],
        },
      };

      it('handleKeyringRequest turns the error into a plain Error with only the message', async () => {
        const keyring = {
          getAccountBalances: jest
            .fn()
            .mockRejectedValue(new BalanceNotSynchronizedError()),
        };

        const error = await handleKeyringRequest(
          keyring as never,
          balancesRequest,
        ).catch((caught: unknown) => caught);

        expect(error).not.toBeInstanceOf(BalanceNotSynchronizedError);
        expect((error as Error).name).toBe('Error');
        expect((error as Error).message).toBe(
          'Account balance unavailable: the account has not been synchronized yet',
        );
      });

      it('does not track the re-created "not synchronized yet" error (the onKeyringRequest path)', async () => {
        const keyring = {
          getAccountBalances: jest
            .fn()
            .mockRejectedValue(
              new BalanceNotSynchronizedError({ account: 'account-1' }),
            ),
        };

        // Same composition as `onKeyringRequest` in src/index.ts.
        await expect(
          middleware.handle(
            async () =>
              (await handleKeyringRequest(keyring as never, balancesRequest)) ??
              null,
          ),
        ).rejects.toThrow('not been synchronized yet');

        expect(keyring.getAccountBalances).toHaveBeenCalled();
        expect(mockTrackError).not.toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
      });

      it('still tracks other errors re-created by the SDK', async () => {
        const keyring = {
          getAccountBalances: jest
            .fn()
            .mockRejectedValue(
              new ExternalServiceError('Failed to synchronize account'),
            ),
        };

        await expect(
          middleware.handle(async () =>
            handleKeyringRequest(keyring as never, balancesRequest),
          ),
        ).rejects.toThrow('Failed to synchronize account');

        expect(mockTrackError).toHaveBeenCalledTimes(1);
      });
    });
  });
});
