import {
  FetchPolicyErrorName,
  isTransientError,
} from '@metamask/snap-networks-utils';
import { NetworkError } from '@stellar/stellar-sdk';
import { BigNumber } from 'bignumber.js';

import { AppConfig } from '../../config';
import { toSmallestUnit } from '../../utils';
import { multiplyFee, toFetchPolicyError } from './utils';

const maxFeeThresholdInStroops = toSmallestUnit(
  new BigNumber(AppConfig.transaction.maxFeeThresholdInXLM),
);

describe('multiplyFee', () => {
  it('multiplies fee by multiplier and rounds up to nearest integer', () => {
    expect(multiplyFee(new BigNumber(11), 1.2)).toStrictEqual(
      new BigNumber(14),
    );
  });

  it('caps fee at maxFeeThresholdInXLM when multiplied fee exceeds threshold', () => {
    expect(multiplyFee(new BigNumber(2_000_000), 10)).toStrictEqual(
      maxFeeThresholdInStroops,
    );
  });

  it('returns multiplied fee when below threshold', () => {
    expect(multiplyFee(new BigNumber(100), 1)).toStrictEqual(
      new BigNumber(100),
    );
  });
});

describe('toFetchPolicyError', () => {
  it('maps Stellar HTTP response metadata', () => {
    const error = new NetworkError('unavailable', {
      status: 503,
      headers: { 'retry-after': '2' },
    });

    expect(toFetchPolicyError(error)).toMatchObject({
      httpStatus: 503,
      retryAfterMs: 2000,
      cause: error,
    });
  });

  it('does not classify JSON-RPC errors as transient', () => {
    const error = toFetchPolicyError({
      code: -32602,
      message: 'Invalid params',
    });

    expect(error.name).not.toBe(FetchPolicyErrorName.Network);
    expect(isTransientError(error)).toBe(false);
  });

  it('maps Soroban missing-account errors to 404', () => {
    const error = new Error(
      'Account not found: GB5QOHJZ6RACA26NFDIEHD7I7SLROLC5P4NATSG43OJV2C5WUR4VEUKG',
    );

    const mapped = toFetchPolicyError(error);
    expect(mapped).toMatchObject({
      httpStatus: 404,
      cause: error,
    });
    expect(isTransientError(mapped)).toBe(false);
  });

  it('maps SDK timeout errors to TimeoutError', () => {
    const axiosTimeoutError = Object.assign(
      new Error('timeout of 10000 ms exceeded'),
      { code: 'ECONNABORTED' },
    );
    const horizonTimeoutError = new Error('timeout of 10000 ms exceeded');

    expect(toFetchPolicyError(axiosTimeoutError)).toMatchObject({
      name: FetchPolicyErrorName.Timeout,
      cause: axiosTimeoutError,
    });
    expect(toFetchPolicyError(horizonTimeoutError)).toMatchObject({
      name: FetchPolicyErrorName.Timeout,
      cause: horizonTimeoutError,
    });
  });
});
