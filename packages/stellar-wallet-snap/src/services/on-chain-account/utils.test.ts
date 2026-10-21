import { BigNumber } from 'bignumber.js';

import {
  ACCOUNT_MINIMUM_BASE_RESERVE_UNIT,
  BASE_RESERVE_STROOPS,
} from '../../constants';
import {
  minimumBalanceStroops,
  calculateSubentryFromMinReserve,
} from './utils';

describe('calculateSubentryFromMinReserve', () => {
  it('returns 0 for an empty account (2 base reserves)', () => {
    const emptyAccountReserve = new BigNumber(ACCOUNT_MINIMUM_BASE_RESERVE_UNIT)
      .times(BASE_RESERVE_STROOPS)
      .toFixed(0);

    expect(calculateSubentryFromMinReserve(emptyAccountReserve)).toBe(0);
  });

  it('recovers subentries when sponsoring fields are 0', () => {
    const stroops = minimumBalanceStroops({
      subentryCount: 4,
      numSponsoring: 0,
      numSponsored: 0,
    }).toFixed(0);

    expect(calculateSubentryFromMinReserve(stroops)).toBe(4);
  });

  it('clamps below the account base reserve at 0', () => {
    expect(calculateSubentryFromMinReserve('0')).toBe(0);
  });
});
