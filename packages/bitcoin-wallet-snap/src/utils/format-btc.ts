/**
 * Formats a non-negative satoshi amount as an exact BTC decimal string.
 *
 * Integer arithmetic avoids scientific notation and floating-point precision
 * loss in keyring amounts and displayed balances.
 *
 * @param satoshis - The amount in satoshis.
 * @returns The BTC amount without unnecessary trailing decimal zeros.
 */
export function formatBtcAmount(satoshis: bigint): string {
  const whole = satoshis / 100_000_000n;
  const fraction = (satoshis % 100_000_000n)
    .toString()
    .padStart(8, '0')
    .replace(/0+$/u, '');

  return fraction ? `${whole}.${fraction}` : whole.toString();
}
