import {
  createTrongridHttpError,
  TrongridAccountNotFoundError,
  TrongridHttpError,
  TrongridRateLimitError,
} from './errors';

describe('trongrid errors', () => {
  describe('TrongridHttpError', () => {
    it('carries the status code and message', () => {
      const error = new TrongridHttpError(500);

      expect(error.status).toBe(500);
      expect(error.message).toBe('HTTP error! status: 500');
      expect(error.name).toBe('TrongridHttpError');
    });
  });

  describe('TrongridRateLimitError', () => {
    it('is a TrongridHttpError with status 429', () => {
      const error = new TrongridRateLimitError();

      expect(error).toBeInstanceOf(TrongridHttpError);
      expect(error.status).toBe(429);
      expect(error.name).toBe('TrongridRateLimitError');
    });
  });

  describe('createTrongridHttpError', () => {
    const buildResponse = (status: number) =>
      ({ status }) as unknown as Parameters<typeof createTrongridHttpError>[0];

    it('returns a TrongridRateLimitError for 429', () => {
      const error = createTrongridHttpError(buildResponse(429));

      expect(error).toBeInstanceOf(TrongridRateLimitError);
      expect(error.status).toBe(429);
    });

    it('returns a TrongridHttpError for non-429 statuses', () => {
      const error = createTrongridHttpError(buildResponse(500));

      expect(error).not.toBeInstanceOf(TrongridRateLimitError);
      expect(error).toBeInstanceOf(TrongridHttpError);
      expect(error.status).toBe(500);
    });
  });

  describe('TrongridAccountNotFoundError', () => {
    it('preserves its error name', () => {
      const error = new TrongridAccountNotFoundError();

      expect(error.name).toBe('TrongridAccountNotFoundError');
      expect(error.message).toBe('Account not found or no data returned');
    });
  });
});
