import type { Infer } from '@metamask/superstruct';
import { enums, refine, string } from '@metamask/superstruct';

/**
 * Validation struct for a UTF-8 string.
 */
export const Utf8StringStruct = refine(string(), 'utf8', (value) => {
  try {
    // Attempt to encode to UTF-8
    const encoder = new TextEncoder();
    encoder.encode(value);
    return true; // Valid UTF-8
  } catch {
    return 'Invalid UTF-8 string';
  }
});

export type Utf8String = Infer<typeof Utf8StringStruct>;

/**
 * Stellar memo kinds (SEP-2 `memo_type` values).
 *
 * When omitted on confirmSend, the builder infers `id` for all-digit uint64
 * values, else `text`.
 */
export const StellarMemoTypes = {
  Text: 'text',
  Id: 'id',
  Hash: 'hash',
  Return: 'return',
} as const;

/** Union of {@link StellarMemoTypes} values — single source of truth with the const. */
export type StellarMemoType =
  (typeof StellarMemoTypes)[keyof typeof StellarMemoTypes];

/**
 * Wire-layer validation for {@link StellarMemoType} — derived from {@link StellarMemoTypes}.
 */
export const StellarMemoTypeStruct = enums([
  StellarMemoTypes.Text,
  StellarMemoTypes.Id,
  StellarMemoTypes.Hash,
  StellarMemoTypes.Return,
]);

/**
 * Wire-layer memo value for confirmSend: loose length gate only (≤ 64 chars)
 * so text, memo id digits, and hash/return hex can all pass. Empty /
 * whitespace-only values are allowed and treated as absent when building.
 * Strict type and text-byte checks run in `resolveStellarMemo` at build time.
 */
export const StellarMemoValueStruct = refine(
  string(),
  'stellar-memo-value',
  (value) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return true;
    }
    if (trimmed.length > 64) {
      return 'Memo is too long';
    }
    return true;
  },
);

export type StellarMemoValue = Infer<typeof StellarMemoValueStruct>;
