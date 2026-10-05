import { Memo } from '@stellar/stellar-sdk';

import { InvalidMemoException } from './exceptions';

const STELLAR_TEXT_MEMO_MAX_BYTES = 28;
const STELLAR_MEMO_ID_MAX = 18446744073709551615n;
const STELLAR_MEMO_ID_PATTERN = /^\d+$/u;

/**
 * Whether `value` is a non-negative decimal uint64 memo id.
 *
 * @param value - Trimmed memo string.
 * @returns True when the value is a valid Stellar memo id.
 */
export function isMemoId(value: string): boolean {
  if (!STELLAR_MEMO_ID_PATTERN.test(value)) {
    return false;
  }
  const asId = BigInt(value);
  return asId >= 0n && asId <= STELLAR_MEMO_ID_MAX;
}

/**
 * Whether `value` fits in a Stellar text memo (≤ 28 UTF-8 bytes).
 *
 * @param value - Trimmed memo string.
 * @returns True when the value is a valid Stellar text memo.
 */
export function isMemoText(value: string): boolean {
  return new TextEncoder().encode(value).length <= STELLAR_TEXT_MEMO_MAX_BYTES;
}

/**
 * Builds a Stellar SDK {@link Memo} from a string value.
 *
 * All-digit uint64 values → {@link Memo.id}; otherwise {@link Memo.text}.
 * Empty / whitespace-only values are treated as absent.
 *
 * Used on the transaction build path (TransactionBuilder), not only UI.
 *
 * @param value - Raw memo from confirmation UI or interface context.
 * @returns SDK memo, or `null` when the value is missing, non-string, or whitespace-only.
 * @throws {InvalidMemoException} When the value is neither a valid memo id nor text memo.
 */
export function resolveStellarMemo(value: unknown): Memo | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    if (isMemoId(trimmed)) {
      return Memo.id(trimmed);
    }

    if (isMemoText(trimmed)) {
      return Memo.text(trimmed);
    }

    throw new Error('Invalid memo');
  } catch {
    throw new InvalidMemoException();
  }
}
