import BigNumber from 'bignumber.js';

import { LAMPORTS_PER_SOL } from '../constants/solana';

/**
 * Converts lamports to SOL.
 *
 * @param amountInLamports - The amount of lamports to convert.
 * @returns The amount of SOL.
 */
export const lamportsToSol = (
  amountInLamports: string | number | bigint | BigNumber,
): BigNumber => {
  return BigNumber(amountInLamports.toString()).dividedBy(LAMPORTS_PER_SOL);
};

/**
 * Converts SOL to lamports.
 *
 * @param amountInSol - The amount of SOL to convert.
 * @returns The amount of lamports.
 */
export const solToLamports = (
  amountInSol: string | number | bigint | BigNumber,
): BigNumber => {
  return BigNumber(amountInSol.toString())
    .multipliedBy(LAMPORTS_PER_SOL)
    .integerValue(BigNumber.ROUND_DOWN);
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
