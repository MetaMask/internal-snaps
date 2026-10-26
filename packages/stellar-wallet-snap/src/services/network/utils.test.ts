import { FetchPolicyErrorName } from '@metamask/snap-networks-utils';
import { NetworkError, NotFoundError } from '@stellar/stellar-sdk';
import { BigNumber } from 'bignumber.js';

import { AppConfig } from '../../config';
import { toSmallestUnit } from '../../utils';
import {
  isAccountNotFoundError,
  isEmptyHttpBody,
  multiplyFee,
  toStellarFetchPolicyError,
  unwrapFetchPolicyError,
} from './utils';

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

const ADDRESS = 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI';
const horizonNotFoundBody = {
  type: 'https://stellar.org/horizon-errors/not_found',
  title: 'Resource Missing',
  status: 404,
};

describe('isEmptyHttpBody', () => {
  it.each([undefined, null, '', '   '])('returns true for %p', (body) => {
    expect(isEmptyHttpBody(body)).toBe(true);
  });

  it.each([horizonNotFoundBody, 'Not Found', {}])(
    'returns false for %p',
    (body) => {
      expect(isEmptyHttpBody(body)).toBe(false);
    },
  );
});

describe('isAccountNotFoundError', () => {
  it('returns true for a Horizon 404 with a problem body', () => {
    expect(
      isAccountNotFoundError(
        new NotFoundError('Not Found', horizonNotFoundBody),
        ADDRESS,
      ),
    ).toBe(true);
  });

  it.each([undefined, ''])(
    'returns false for an empty-body 404 (%p), which does not come from Horizon',
    (body) => {
      expect(
        isAccountNotFoundError(new NotFoundError('Not Found', body), ADDRESS),
      ).toBe(false);
    },
  );

  it('returns true for the RPC "Account not found" error', () => {
    expect(
      isAccountNotFoundError(
        new Error(`Account not found: ${ADDRESS}`),
        ADDRESS,
      ),
    ).toBe(true);
  });

  it('returns false for a network failure', () => {
    expect(isAccountNotFoundError(new TypeError('Failed to fetch'), ADDRESS)).toBe(
      false,
    );
  });
});

describe('toStellarFetchPolicyError', () => {
  it('maps a confirmed missing account to a non-retryable 404', () => {
    const original = new NotFoundError('Not Found', horizonNotFoundBody);

    const mapped = toStellarFetchPolicyError(original, ADDRESS);

    expect(mapped.httpStatus).toBe(404);
    expect(mapped.cause).toBe(original);
  });

  it('maps an empty-body 404 to a network error', () => {
    const original = new NotFoundError('Not Found', '');

    const mapped = toStellarFetchPolicyError(original, ADDRESS);

    expect(mapped.name).toBe(FetchPolicyErrorName.Network);
    expect(mapped.httpStatus).toBeUndefined();
    expect(mapped.cause).toBe(original);
  });

  it('keeps the status of a Horizon error response', () => {
    const original = new NetworkError('Service Unavailable', {
      status: 503,
      title: 'Service Unavailable',
    } as never);

    const mapped = toStellarFetchPolicyError(original, ADDRESS);

    expect(mapped.httpStatus).toBe(503);
    expect(mapped.cause).toBe(original);
  });

  it('maps a bare fetch failure to a network error', () => {
    const original = new Error('Failed to fetch');

    const mapped = toStellarFetchPolicyError(original);

    expect(mapped.name).toBe(FetchPolicyErrorName.Network);
    expect(mapped.message).toBe('Failed to fetch');
    expect(mapped.cause).toBe(original);
  });
});

describe('unwrapFetchPolicyError', () => {
  it('returns the original SDK error of a mapped error', () => {
    const original = new NotFoundError('Not Found', horizonNotFoundBody);

    expect(
      unwrapFetchPolicyError(toStellarFetchPolicyError(original, ADDRESS)),
    ).toBe(original);
  });

  it('returns other errors unchanged', () => {
    const error = new Error('boom');

    expect(unwrapFetchPolicyError(error)).toBe(error);
  });
});
