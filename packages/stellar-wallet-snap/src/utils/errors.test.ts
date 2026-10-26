import { UserRejectedRequestError } from '@metamask/snaps-sdk';

import {
  AccountBalanceStaleException,
  AccountBalanceUnavailableException,
} from '../handlers/keyring/exceptions';
import {
  InvalidHttpRequestParamsException,
  isExpectedStateException,
  rethrowIfInstanceElseThrow,
  shouldTrackError,
  StellarSnapException,
} from './errors';

describe('errors', () => {
  describe('shouldTrackError', () => {
    it('does not track the expected "not synchronized yet" balance state', () => {
      const error = new AccountBalanceUnavailableException('account-1');
      expect(isExpectedStateException(error)).toBe(true);
      expect(shouldTrackError(error)).toBe(false);
    });

    it('does not track the state once re-created, wrapped or serialized (v3)', () => {
      const { message } = new AccountBalanceUnavailableException('account-1');
      expect(shouldTrackError(new Error(message))).toBe(false);
      expect(
        shouldTrackError(
          new Error('wrapped', {
            cause: new AccountBalanceUnavailableException('account-1'),
          }),
        ),
      ).toBe(false);
      expect(shouldTrackError({ name: 'Error', message })).toBe(false);
      expect(shouldTrackError(message)).toBe(false);
    });

    it('does not track the stale-balance state, even re-created or wrapped (v6)', () => {
      const error = new AccountBalanceStaleException('account-1');
      expect(isExpectedStateException(error)).toBe(true);
      expect(shouldTrackError(error)).toBe(false);
      expect(shouldTrackError(new Error(error.message))).toBe(false);
      expect(shouldTrackError(new Error('wrapped', { cause: error }))).toBe(
        false,
      );
      expect(shouldTrackError({ name: 'Error', message: error.message })).toBe(
        false,
      );
    });

    it('does not track user rejections', () => {
      expect(shouldTrackError(new UserRejectedRequestError())).toBe(false);
    });

    it('tracks real failures', () => {
      expect(shouldTrackError(new StellarSnapException('boom'))).toBe(true);
      expect(shouldTrackError(new Error('boom'))).toBe(true);
      expect(isExpectedStateException(new Error('boom'))).toBe(false);
    });
  });

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
      expect(new InvalidHttpRequestParamsException('bad params').message).toBe(
        'bad params',
      );
    });
  });
});
