import type { Infer } from '@metamask/superstruct';
import { enums, refine, string } from '@metamask/superstruct';

import { STELLAR_TEXT_MEMO_MAX_BYTES } from '../constants';

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
 * Optional explicit Stellar memo type (SEP-2 `memo_type` when known).
 * When omitted, the builder infers `id` for all-digit uint64 values, else `text`.
 */
export const StellarMemoTypeStruct = enums(['text', 'id', 'hash', 'return']);

export type StellarMemoTypeParam = Infer<typeof StellarMemoTypeStruct>;

/**
 * Validation struct for an optional Stellar text memo (≤ 28 UTF-8 bytes).
 * Empty / whitespace-only values are allowed at the wire layer and treated as
 * absent when building the transaction.
 */
export const StellarTextMemoStruct = refine(
  string(),
  'stellar-text-memo',
  (value) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return true;
    }
    if (
      new TextEncoder().encode(trimmed).length > STELLAR_TEXT_MEMO_MAX_BYTES
    ) {
      return `Memo must be ${STELLAR_TEXT_MEMO_MAX_BYTES} bytes or fewer`;
    }
    return true;
  },
);

export type StellarTextMemo = Infer<typeof StellarTextMemoStruct>;

/**
 * Wire-layer memo value for confirmSend: allows text (≤ 28 bytes), memo id
 * digits, or 64-char hex for hash/return. Strict type checks run at build time.
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
