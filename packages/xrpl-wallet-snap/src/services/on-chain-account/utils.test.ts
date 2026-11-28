import { BigNumber } from 'bignumber.js';

import {
  calculateLedgerMetaFromMinReserve,
  calculateSpendableBalance,
  minimumBalanceDrops,
} from './utils';

describe('calculateLedgerMetaFromMinReserve', () => {
  it('keeps the 1 XRP base reserve on the controller path', () => {
    const meta = calculateLedgerMetaFromMinReserve('1000000');

    expect(meta).toMatchObject({ ownerCount: 0, paysOwnBaseReserve: true });
    expect(minimumBalanceDrops(meta).toFixed(0)).toBe('1000000');
    expect(
      calculateSpendableBalance({
        nativeBalance: new BigNumber('2000000'),
        ...meta,
      }).toFixed(0),
    ).toBe('1000000');
  });

  it('counts owner objects above the base reserve', () => {
    const meta = calculateLedgerMetaFromMinReserve('1200000');

    expect(meta).toMatchObject({ ownerCount: 1, paysOwnBaseReserve: true });
    expect(minimumBalanceDrops(meta).toFixed(0)).toBe('1200000');
  });

  it('treats a reserve below 1 XRP as owner reserve without a base reserve', () => {
    const meta = calculateLedgerMetaFromMinReserve('200000');

    expect(meta).toMatchObject({ ownerCount: 1, paysOwnBaseReserve: false });
    expect(minimumBalanceDrops(meta).toFixed(0)).toBe('200000');
  });

  it('returns an empty reserve for a zero total', () => {
    const meta = calculateLedgerMetaFromMinReserve('0');

    expect(meta).toMatchObject({
      ownerCount: 0,
      sponsoredOwnerCount: 0,
      paysOwnBaseReserve: false,
    });
    expect(minimumBalanceDrops(meta).toFixed(0)).toBe('0');
  });
});
