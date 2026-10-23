import { BigNumber } from 'bignumber.js';

import {
  ACCOUNT_MINIMUM_BASE_RESERVE_UNIT,
  BASE_RESERVE_STROOPS,
} from '../../constants';
import {
  calculateLedgerMetaFromMinReserve,
  calculateSpendableBalance,
  minimumBalanceStroops,
} from './utils';

describe('calculateLedgerMetaFromMinReserve', () => {
  it('returns zero sponsorship meta for an empty account (2 base reserves)', () => {
    const emptyAccountReserve = new BigNumber(ACCOUNT_MINIMUM_BASE_RESERVE_UNIT)
      .times(BASE_RESERVE_STROOPS)
      .toFixed(0);

    expect(
      calculateLedgerMetaFromMinReserve(emptyAccountReserve),
    ).toStrictEqual({
      subentryCount: 0,
      numSponsoring: 0,
      numSponsored: 0,
    });
  });

  it('recovers subentries when the reserve is at or above two base reserves', () => {
    const stroops = minimumBalanceStroops({
      subentryCount: 4,
      numSponsoring: 0,
      numSponsored: 0,
    }).toFixed(0);

    expect(calculateLedgerMetaFromMinReserve(stroops)).toStrictEqual({
      subentryCount: 4,
      numSponsoring: 0,
      numSponsored: 0,
    });
  });

  it('encodes a sponsored reserve below two base reserves as numSponsored', () => {
    const oneBaseReserve = new BigNumber(BASE_RESERVE_STROOPS).toFixed(0);

    expect(calculateLedgerMetaFromMinReserve(oneBaseReserve)).toStrictEqual({
      subentryCount: 0,
      numSponsoring: 0,
      numSponsored: 1,
    });
    expect(
      minimumBalanceStroops(calculateLedgerMetaFromMinReserve(oneBaseReserve)),
    ).toStrictEqual(new BigNumber(oneBaseReserve));
  });

  it('preserves spendable when the reserve is fully sponsored', () => {
    const nativeBalance = new BigNumber(50_000_000);
    const meta = calculateLedgerMetaFromMinReserve('0');

    expect(meta).toStrictEqual({
      subentryCount: 0,
      numSponsoring: 0,
      numSponsored: 2,
    });
    expect(
      calculateSpendableBalance({
        nativeBalance,
        ...meta,
      }),
    ).toStrictEqual(nativeBalance);
  });
});
