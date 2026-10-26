import { BrokenCircuitError } from '@metamask/base-data-service';

import {
  createFetchPolicyError,
  FetchPolicyErrorName,
} from './createFetchPolicy';
import {
  shouldUseFallbackEndpoint,
  withEndpointFallback,
} from './withEndpointFallback';

describe('shouldUseFallbackEndpoint', () => {
  it.each([
    ['a network error', createFetchPolicyError('x', { name: FetchPolicyErrorName.Network })],
    ['a timeout', createFetchPolicyError('x', { name: FetchPolicyErrorName.Timeout })],
    ['a 503', createFetchPolicyError('x', { httpStatus: 503 })],
    ['a 429', createFetchPolicyError('x', { httpStatus: 429 })],
    ['a bare TypeError', new TypeError('Failed to fetch')],
    ['an open circuit', new BrokenCircuitError()],
    ['a non-error', 'boom'],
  ])('falls back on %s', (_label, error) => {
    expect(shouldUseFallbackEndpoint(error)).toBe(true);
  });

  it.each([
    ['a 404', createFetchPolicyError('x', { httpStatus: 404 })],
    ['a 400', createFetchPolicyError('x', { httpStatus: 400 })],
    ['an abort', Object.assign(new Error('aborted'), { name: 'AbortError' })],
  ])('does not fall back on %s', (_label, error) => {
    expect(shouldUseFallbackEndpoint(error)).toBe(false);
  });
});

describe('withEndpointFallback', () => {
  it('returns the primary result', async () => {
    const fallback = jest.fn();
    expect(await withEndpointFallback(async () => 1, fallback)).toBe(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('uses the fallback on a transport failure', async () => {
    const onFallback = jest.fn();
    const result = await withEndpointFallback(
      async () => {
        throw new TypeError('Failed to fetch');
      },
      async () => 2,
      { onFallback },
    );
    expect(result).toBe(2);
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('rethrows the primary error without a fallback', async () => {
    const error = new TypeError('Failed to fetch');
    await expect(
      withEndpointFallback(async () => {
        throw error;
      }, undefined),
    ).rejects.toBe(error);
  });

  it('does not fall back on a 404', async () => {
    const fallback = jest.fn();
    const error = createFetchPolicyError('nf', { httpStatus: 404 });
    await expect(
      withEndpointFallback(async () => {
        throw error;
      }, fallback),
    ).rejects.toBe(error);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('rethrows the primary error with the fallback error attached', async () => {
    const primaryError = new TypeError('Failed to fetch');
    const fallbackError = new Error('also down');
    const rejection = withEndpointFallback(
      async () => {
        throw primaryError;
      },
      async () => {
        throw fallbackError;
      },
    );
    await expect(rejection).rejects.toBe(primaryError);
    expect((primaryError as unknown as { fallbackError: unknown }).fallbackError).toBe(
      fallbackError,
    );
  });
});
