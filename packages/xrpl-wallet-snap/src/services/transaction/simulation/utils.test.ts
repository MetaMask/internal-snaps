import { BigNumber } from 'bignumber.js';

import {
  RequiresDestinationTagException,
  TransactionValidationException,
  TrustlineExceedLimitException,
} from '../exceptions';
import type { AccountState } from './api';
import {
  createdAccount,
  getAccount,
  getSpendable,
  isIssuedAmount,
  shouldSkipValidationException,
} from './utils';

function account(nativeRawBalance: string): AccountState {
  return {
    nativeRawBalance: new BigNumber(nativeRawBalance),
    ownerCount: 0,
    sponsoringAccountCount: 0,
    sponsoringOwnerCount: 0,
    sponsoredOwnerCount: 0,
    paysOwnBaseReserve: true,
    requireDestTag: false,
    globalFreeze: false,
    trustlines: new Map(),
    mptokens: new Map(),
  };
}

describe('simulation utils', () => {
  it('matches skipExceptions by class or subclass', () => {
    expect(
      shouldSkipValidationException(
        [RequiresDestinationTagException],
        RequiresDestinationTagException,
      ),
    ).toBe(true);
    expect(
      shouldSkipValidationException(
        [TransactionValidationException],
        TrustlineExceedLimitException,
      ),
    ).toBe(true);
    expect(
      shouldSkipValidationException(
        [TrustlineExceedLimitException],
        RequiresDestinationTagException,
      ),
    ).toBe(false);
    expect(
      shouldSkipValidationException(undefined, RequiresDestinationTagException),
    ).toBe(false);
  });

  it('subtracts the 1 XRP base reserve from spendable drops', () => {
    expect(getSpendable(account('10000000')).toFixed(0)).toBe('9000000');
  });

  it('returns a preloaded account and rejects a missing one', () => {
    const state = { accounts: new Map([['rSender', account('1')]]) };

    expect(getAccount(state, 'rSender').nativeRawBalance.toFixed(0)).toBe('1');
    expect(() => getAccount(state, 'rMissing')).toThrow(
      TransactionValidationException,
    );
  });

  it('creates an account funded by the payment amount', () => {
    const created = createdAccount(new BigNumber('1000000'));

    expect(created.nativeRawBalance.toFixed(0)).toBe('1000000');
    expect(created.trustlines.size).toBe(0);
  });

  it('detects an issued amount', () => {
    expect(
      isIssuedAmount({ currency: 'USD', issuer: 'rIssuer', value: '1' }),
    ).toBe(true);
    expect(isIssuedAmount('10')).toBe(false);
    expect(
      isIssuedAmount({ mpt_issuance_id: 'A'.repeat(48), value: '1' }),
    ).toBe(false);
  });
});
