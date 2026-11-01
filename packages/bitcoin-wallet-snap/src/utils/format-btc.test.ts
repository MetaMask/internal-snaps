/**
 * @jest-environment node
 */

import { BalanceStruct } from '@metamask/keyring-api';
import { assert } from '@metamask/superstruct';

import { formatBtcAmount } from './format-btc';

describe('formatBtcAmount', () => {
  it.each([
    [0n, '0'],
    [1n, '0.00000001'],
    [9n, '0.00000009'],
    [10n, '0.0000001'],
    [11n, '0.00000011'],
    [64n, '0.00000064'],
    [77n, '0.00000077'],
    [99n, '0.00000099'],
    [100n, '0.000001'],
    [101n, '0.00000101'],
    [1_000n, '0.00001'],
    [10_000n, '0.0001'],
    [100_000n, '0.001'],
    [1_000_000n, '0.01'],
    [10_000_000n, '0.1'],
    [99_999_999n, '0.99999999'],
    [100_000_000n, '1'],
    [100_000_001n, '1.00000001'],
    [100_000_010n, '1.0000001'],
    [100_010_000n, '1.0001'],
    [123_456_789n, '1.23456789'],
    [1_000_000_000n, '10'],
    [1_230_000_000n, '12.3'],
    [2_100_000_000_000_000n, '21000000'],
    [9_007_199_254_740_991n, '90071992.54740991'],
    [9_007_199_254_740_992n, '90071992.54740992'],
    [9_007_199_254_740_993n, '90071992.54740993'],
    [18_446_744_073_709_551_615n, '184467440737.09551615'],
  ])('formats %s satoshis as %s BTC', (satoshis, expected) => {
    expect(formatBtcAmount(satoshis)).toBe(expected);
  });

  it('produces valid keyring balances for every amount below 100 satoshis', () => {
    // Number.toString() uses scientific notation for these BTC values.
    for (let satoshis = 1n; satoshis < 100n; satoshis += 1n) {
      const amount = formatBtcAmount(satoshis);

      expect(() =>
        assert({ amount, unit: 'BTC' }, BalanceStruct),
      ).not.toThrow();
    }
  });
});
