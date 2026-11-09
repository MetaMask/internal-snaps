import {
  BrokenCircuitError,
  createFetchPolicyError,
  FetchPolicyErrorName,
} from '@metamask/snap-networks-utils';
import { UserRejectedRequestError } from '@metamask/snaps-sdk';

import { AccountBalanceUnavailableException } from '../handlers/keyring/exceptions';
import {
  HttpException,
  HttpResponseException,
  InvalidHttpRequestParamsException,
  isExpectedStateException,
  isHttpException,
  KnownHttpErrorCode,
  normalizeHttpException,
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

  describe('normalizeHttpException', () => {
    it('wraps HTTP status policy errors in HttpResponseException', () => {
      const error = createFetchPolicyError('HTTP 503', { httpStatus: 503 });

      expect(normalizeHttpException(error)).toBeInstanceOf(
        HttpResponseException,
      );
    });

    it('wraps network, timeout, and broken-circuit errors in HttpException', () => {
      const networkError = createFetchPolicyError('network failed', {
        name: FetchPolicyErrorName.Network,
      });
      const timeoutError = createFetchPolicyError('timed out', {
        name: FetchPolicyErrorName.Timeout,
      });
      const brokenCircuitError = new BrokenCircuitError();

      expect(normalizeHttpException(networkError)).toBeInstanceOf(
        HttpException,
      );
      expect(normalizeHttpException(timeoutError)).toBeInstanceOf(
        HttpException,
      );
      expect(normalizeHttpException(brokenCircuitError)).toBeInstanceOf(
        HttpException,
      );
    });

    it.each([
      KnownHttpErrorCode.ConnectionAborted,
      KnownHttpErrorCode.Timeout,
      KnownHttpErrorCode.Canceled,
    ])('wraps transport code %s in HttpException', (code) => {
      const error = Object.assign(new Error('transport'), { code });

      expect(isHttpException(error)).toBe(true);
      expect(normalizeHttpException(error)).toBeInstanceOf(HttpException);
    });

    it('recognizes a known code on error.cause', () => {
      const error = new Error('wrapped', {
        cause: { code: KnownHttpErrorCode.ConnectionReset },
      });

      expect(isHttpException(error)).toBe(true);
    });

    it('leaves an unknown transport code unchanged', () => {
      const error = Object.assign(new Error('nope'), { code: 'ESOMETHING' });

      expect(isHttpException(error)).toBe(false);
      expect(normalizeHttpException(error)).toBe(error);
    });
  });
});
