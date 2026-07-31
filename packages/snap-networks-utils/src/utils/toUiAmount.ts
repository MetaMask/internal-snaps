/**
 * Converts a raw amount (smallest unit) to a UI amount string.
 *
 * @param rawAmount - Amount without decimals applied.
 * @param decimals - Token decimal places.
 * @returns Human-readable amount string.
 */
export function toUiAmount(rawAmount: string, decimals: number): string {
  if (decimals <= 0) {
    return rawAmount;
  }

  const negative = rawAmount.startsWith('-');
  const digits = negative ? rawAmount.slice(1) : rawAmount;
  const padded = digits.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  let fraction = padded.slice(-decimals);
  while (fraction.endsWith('0')) {
    fraction = fraction.slice(0, -1);
  }
  const value = fraction.length > 0 ? `${whole}.${fraction}` : whole;

  return negative ? `-${value}` : value;
}
