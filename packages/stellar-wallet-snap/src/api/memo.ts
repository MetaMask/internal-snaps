import { Memo } from '@stellar/stellar-sdk';

import { STELLAR_TEXT_MEMO_MAX_BYTES } from '../constants';

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
 * Locale keys returned by {@link getMemoDraftValidationError}.
 */
export type MemoDraftValidationErrorKey = 'confirmation.memo.error.tooLong';

/**
 * Validates a memo draft the same way {@link resolveStellarMemo} will attach it:
 * all-digit uint64 → memo id; otherwise text (≤ 28 UTF-8 bytes). Digits outside
 * uint64 that still fit in 28 bytes are accepted as text.
 *
 * @param value - Raw draft from the confirmation UI (may include whitespace).
 * @returns Locale error key, or `null` when empty/whitespace or valid.
 */
export function getMemoDraftValidationError(
  value: string,
): MemoDraftValidationErrorKey | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (isMemoId(trimmed) || isMemoText(trimmed)) {
    return null;
  }

  return 'confirmation.memo.error.tooLong';
}

/**
 * Builds a Stellar SDK {@link Memo} from a string value.
 *
 * All-digit uint64 values → {@link Memo.id}; otherwise {@link Memo.text}.
 * Empty / whitespace-only values are treated as absent.
 *
 * @param value - Raw memo string (e.g. from confirmation UI).
 * @returns SDK memo, or `null` when the value is empty / whitespace-only.
 * @throws {Error} When the value is neither a valid memo id nor text memo.
 */
export function resolveStellarMemo(value?: string | null): Memo | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) {
    return null;
  }

  if (isMemoId(trimmed)) {
    return Memo.id(trimmed);
  }

  if (isMemoText(trimmed)) {
    return Memo.text(trimmed);
  }

  throw new Error(`Memo must be ${STELLAR_TEXT_MEMO_MAX_BYTES} bytes or fewer`);
}
