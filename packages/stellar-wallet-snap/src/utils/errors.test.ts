import {
  InvalidHttpRequestParamsException,
  rethrowIfInstanceElseThrow,
} from './errors';

describe('errors', () => {
  describe('rethrowIfInstanceElseThrow', () => {
    class SampleDomainError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'SampleDomainError';
      }
    }

    class SampleDomainSubError extends SampleDomainError {}

    class OtherDomainError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'OtherDomainError';
      }
    }

    it('rethrows when error matches the sole constructor in the list', () => {
      const original = new SampleDomainError('preserved');
      expect(() =>
        rethrowIfInstanceElseThrow(
          original,
          [SampleDomainError],
          new SampleDomainError('fallback'),
        ),
      ).toThrow(original);
    });

    it('rethrows subclass instances as the base class match', () => {
      const sub = new SampleDomainSubError('sub');
      expect(() =>
        rethrowIfInstanceElseThrow(
          sub,
          [SampleDomainError],
          new SampleDomainError('fallback'),
        ),
      ).toThrow(sub);
    });

    it('throws fallback when error is not an instance of any listed class', () => {
      expect(() =>
        rethrowIfInstanceElseThrow(
          new Error('generic'),
          [SampleDomainError],
          new SampleDomainError('wrapped'),
        ),
      ).toThrow(
        expect.objectContaining({
          name: 'SampleDomainError',
          message: 'wrapped',
        }),
      );
    });

    it('rethrows when error matches any constructor in the list', () => {
      const firstMatch = new SampleDomainError('first');
      expect(() =>
        rethrowIfInstanceElseThrow(
          firstMatch,
          [SampleDomainError, OtherDomainError],
          new SampleDomainError('fallback'),
        ),
      ).toThrow(firstMatch);

      const secondMatch = new OtherDomainError('second');
      expect(() =>
        rethrowIfInstanceElseThrow(
          secondMatch,
          [SampleDomainError, OtherDomainError],
          new SampleDomainError('fallback'),
        ),
      ).toThrow(secondMatch);
    });

    it('throws fallback when error matches none of the constructors', () => {
      expect(() =>
        rethrowIfInstanceElseThrow(
          new Error('generic'),
          [SampleDomainError, OtherDomainError],
          new SampleDomainError('wrapped'),
        ),
      ).toThrow(
        expect.objectContaining({
          name: 'SampleDomainError',
          message: 'wrapped',
        }),
      );
    });
  });

  describe('InvalidHttpRequestParamsException', () => {
    it('can be constructed with a message', () => {
      expect(
        new InvalidHttpRequestParamsException('bad params').message,
      ).toBe('bad params');
    });
  });
});
