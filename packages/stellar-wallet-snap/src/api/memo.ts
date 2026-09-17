import type { Infer } from '@metamask/superstruct';
import { assert, is, refine, string } from '@metamask/superstruct';
import { Memo } from '@stellar/stellar-sdk';

import { STELLAR_TEXT_MEMO_MAX_BYTES } from '../constants';

const STELLAR_MEMO_ID_MAX = 18446744073709551615n;

/**
 * Non-negative decimal uint64 memo id (exchange-style numeric memos).
 */
export const StellarMemoIdStruct = refine(
  string(),
  'stellar-memo-id',
  (value) => {
    if (!/^\d+$/u.test(value)) {
      return 'Memo id must be a non-negative decimal integer';
    }
    try {
      const asId = BigInt(value);
      if (asId < 0n || asId > STELLAR_MEMO_ID_MAX) {
        return 'Memo id is out of uint64 range';
      }
      return true;
    } catch {
      return 'Memo id must be a non-negative decimal integer';
    }
  },
);

export type StellarMemoId = Infer<typeof StellarMemoIdStruct>;

/**
 * Stellar text memo (≤ 28 UTF-8 bytes on-chain).
 */
export const StellarTextMemoStruct = refine(
  string(),
  'stellar-text-memo',
  (value) => {
    if (new TextEncoder().encode(value).length > STELLAR_TEXT_MEMO_MAX_BYTES) {
      return `Memo must be ${STELLAR_TEXT_MEMO_MAX_BYTES} bytes or fewer`;
    }
    return true;
  },
);

export type StellarTextMemo = Infer<typeof StellarTextMemoStruct>;

/**
 * Builds a Stellar SDK {@link Memo} from a string value.
 *
 * All-digit uint64 values → {@link Memo.id}; otherwise {@link Memo.text}.
 * Empty / whitespace-only values are treated as absent.
 *
 * @param value - Raw memo string (e.g. from confirmation UI).
 * @returns SDK memo, or `null` when the value is empty / whitespace-only.
 * @throws {StructError} When the value is invalid for the inferred type.
 */
export function resolveStellarMemo(value?: string | null): Memo | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) {
    return null;
  }

  if (is(trimmed, StellarMemoIdStruct)) {
    return Memo.id(trimmed);
  }

  assert(trimmed, StellarTextMemoStruct);
  return Memo.text(trimmed);
}
