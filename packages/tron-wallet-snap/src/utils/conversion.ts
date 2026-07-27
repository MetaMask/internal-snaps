import { BigNumber } from 'bignumber.js';

import { SUN_IN_TRX } from '../constants';

/**
 * Converts TRX to Sun (the smallest unit of TRX).
 * 1 TRX = 1,000,000 Sun
 *
 * @param amountInTrx - The amount of TRX to convert.
 * @returns The amount in Sun as an integer string.
 */
export const trxToSun = (amountInTrx: string | number | BigNumber): string => {
  return BigNumber(amountInTrx.toString())
    .multipliedBy(SUN_IN_TRX)
    .integerValue(BigNumber.ROUND_DOWN)
    .toFixed(0);
};

/**
 * Converts Sun to TRX.
 * 1,000,000 Sun = 1 TRX
 *
 * @param amountInSun - The amount of Sun to convert.
 * @returns The amount in TRX as a BigNumber.
 */
export const sunToTrx = (
  amountInSun: string | number | BigNumber,
): BigNumber => {
  return BigNumber(amountInSun.toString()).dividedBy(SUN_IN_TRX);
};

/**
 * Converts a UI amount (human-readable with decimals) to a raw amount (smallest unit).
 * For example, with 6 decimals: 1.5 → 1500000
 *
 * @param uiAmount - The UI amount to convert.
 * @param decimals - The number of decimal places for the token.
 * @returns The raw amount as an integer string.
 */
export const toRawAmount = (
  uiAmount: string | number | BigNumber,
  decimals: number,
): string => {
  return BigNumber(uiAmount.toString())
    .multipliedBy(BigNumber(10).pow(decimals))
    .integerValue(BigNumber.ROUND_DOWN)
    .toFixed(0);
};

/**
 * Converts a raw amount (smallest unit) to a UI amount (human-readable with decimals).
 * For example, with 6 decimals: 1500000 → 1.5
 *
 * @param rawAmount - The raw amount to convert.
 * @param decimals - The number of decimal places for the token.
 * @returns The UI amount as a BigNumber.
 */
export const toUiAmount = (
  rawAmount: string | number | BigNumber,
  decimals: number,
): BigNumber => {
  return BigNumber(rawAmount.toString()).dividedBy(BigNumber(10).pow(decimals));
};
