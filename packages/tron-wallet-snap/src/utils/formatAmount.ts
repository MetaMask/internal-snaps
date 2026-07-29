import { BigNumber } from 'bignumber.js';

/**
 * Formats a numeric string with thousand separators using BigNumber.
 * Handles extreme values without precision loss.
 *
 * @param value - The numeric string to format.
 * @returns The formatted string with separators.
 */
export function formatAmount(value: string): string {
  const bn = new BigNumber(value);

  if (!bn.isFinite()) {
    return '0';
  }

  return bn.toFormat({
    groupSize: 3,
    groupSeparator: ',',
    decimalSeparator: '.',
  });
}
