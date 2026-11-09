import type { GetPreferencesResult } from '@metamask/snaps-sdk';
import type { Mock } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { BaseError, ExternalServiceError } from '../entities';
import type { Logger, SnapClient, Translator } from '../entities';
import * as Errors from '../utils/errors';
import { HandlerMiddleware } from './HandlerMiddleware';

describe('HandlerMiddleware', () => {
  const mockLogger = mock<Logger>();
  const mockSnapClient = mock<SnapClient>({
    getPreferences: vi.fn(),
  });
  const mockTranslator = mock<Translator>({
    load: vi.fn(),
  });
  let mockTrackError: Mock;

  const middleware = new HandlerMiddleware(
    mockLogger,
    mockSnapClient,
    mockTranslator,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockTrackError = vi
      .spyOn(Errors, 'trackError')
      .mockResolvedValue(undefined) as unknown as Mock;
    mockSnapClient.getPreferences.mockResolvedValue({
      locale: 'en',
    } as GetPreferencesResult);
    mockTranslator.load.mockResolvedValue({});
  });

  describe('handle', () => {
    it('executes the function successfully', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await middleware.handle(mockFn);

      expect(result).toBe('success');
    });

    it('wraps an unexpected Error and preserves its message', async () => {
      const error = new Error('boom');
      const mockFn = vi.fn().mockRejectedValue(error);

      await expect(middleware.handle(mockFn)).rejects.toThrow('boom');
      expect(mockSnapClient.getPreferences).toHaveBeenCalled();
      expect(mockTranslator.load).toHaveBeenCalledWith('en');
      expect(mockLogger.error).toHaveBeenCalledWith(error);
      expect(mockTrackError).toHaveBeenCalledWith(error);
    });

    it('tracks an unexpected Error before rethrowing it as a SnapError', async () => {
      const error = new Error('tracked boom');
      const mockFn = vi.fn().mockRejectedValue(error);

      await expect(middleware.handle(mockFn)).rejects.toThrow('tracked boom');
      expect(mockTrackError).toHaveBeenCalledWith(error);
    });

    it('continues to throw a SnapError when trackError is invoked', async () => {
      const error = new Error('boom after tracking failure');
      const mockFn = vi.fn().mockRejectedValue(error);

      await expect(middleware.handle(mockFn)).rejects.toThrow(error.message);

      expect(mockTrackError).toHaveBeenCalledWith(error);
      expect(mockSnapClient.getPreferences).toHaveBeenCalled();
    });

    it('wraps a non-Error thrown value by stringifying it', async () => {
      const mockFn = vi.fn().mockRejectedValue('string failure');

      await expect(middleware.handle(mockFn)).rejects.toThrow('string failure');
      expect(mockLogger.error).toHaveBeenCalledWith('string failure');
      expect(mockTrackError).toHaveBeenCalledWith('string failure');
    });

    it('wraps a thrown plain object by stringifying it', async () => {
      const thrown = { foo: 'bar' };
      const mockFn = vi.fn().mockRejectedValue(thrown);

      await expect(middleware.handle(mockFn)).rejects.toThrow(
        '[object Object]',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(thrown);
      expect(mockTrackError).toHaveBeenCalledWith(thrown);
    });

    it('uses the message property if it exists on a thrown plain object', async () => {
      const thrown = { message: 'InsufficientFunds', code: 11 };
      const mockFn = vi.fn().mockRejectedValue(thrown);

      await expect(middleware.handle(mockFn)).rejects.toThrow(
        'InsufficientFunds',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(thrown);
      expect(mockTrackError).toHaveBeenCalledWith(thrown);
    });

    it('handles error successfully if instance of BaseError', async () => {
      const error = new BaseError('Test error', 1);
      const mockFn = vi.fn().mockRejectedValue(error);
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
      const mockFn = vi.fn().mockRejectedValue(error);
      mockTranslator.load.mockResolvedValue({
        'error.3000': { message: 'Connection error' },
      });

      await expect(middleware.handle(mockFn)).rejects.toThrow(
        'Connection error: Failed to synchronize account',
      );
      expect(mockTrackError).toHaveBeenCalledWith(error);
    });
  });
});
