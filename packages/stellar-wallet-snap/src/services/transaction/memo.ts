import { Memo } from '@stellar/stellar-sdk';

import { STELLAR_TEXT_MEMO_MAX_BYTES } from '../../constants';

/**
 * Stellar memo kinds supported when attaching a memo to a send transaction.
 *
 * When federation (SEP-2) or muxed destinations are available, pass the
 * destination's `memo_type` as {@link StellarMemoType}. Until then, numeric
 * values are inferred as `id` (exchange-style); everything else falls back to
 * `text`.
 */
export const StellarMemoType = {
  Text: 'text',
  Id: 'id',
  Hash: 'hash',
  Return: 'return',
} as const;

export type StellarMemoType =
  (typeof StellarMemoType)[keyof typeof StellarMemoType];

const STELLAR_MEMO_ID_MAX = 18446744073709551615n;
const STELLAR_MEMO_HASH_HEX_LENGTH = 64;
const STELLAR_MEMO_HASH_HEX_PATTERN = /^[0-9a-fA-F]+$/u;

/**
 * Infers a memo type when the destination / client did not specify one.
 * All-digit uint64 values → `id` (common for exchanges); otherwise `text`.
 *
 * @param value - Trimmed memo string.
 * @returns Inferred memo type.
 */
export function inferStellarMemoType(value: string): StellarMemoType {
  if (/^\d+$/u.test(value)) {
    try {
      const asId = BigInt(value);
      if (asId >= 0n && asId <= STELLAR_MEMO_ID_MAX) {
        return StellarMemoType.Id;
      }
    } catch {
      // Fall through to text.
    }
  }
  return StellarMemoType.Text;
}

/**
 * Builds a Stellar SDK {@link Memo} from a string value and optional type hint.
 *
 * Resolution order:
 * 1. Explicit `type` when provided (federation / client hint)
 * 2. Otherwise {@link inferStellarMemoType} (numeric → id, else text)
 *
 * @param params - Memo value and optional type.
 * @param params.value - Raw memo string from the client or confirmation UI.
 * @param params.type - Optional explicit type (SEP-2 `memo_type` when known).
 * @returns SDK memo, or `null` when the value is empty / whitespace-only.
 * @throws {Error} When the value is invalid for the resolved type.
 */
export function resolveStellarMemo(params: {
  value?: string | null;
  type?: StellarMemoType | null;
}): Memo | null {
  const trimmed = params.value?.trim() ?? '';
  if (trimmed.length === 0) {
    return null;
  }

  const type = params.type ?? inferStellarMemoType(trimmed);

  switch (type) {
    case StellarMemoType.Id:
      assertMemoId(trimmed);
      return Memo.id(trimmed);
    case StellarMemoType.Hash:
      assertMemoHashOrReturn(trimmed, StellarMemoType.Hash);
      return Memo.hash(trimmed);
    case StellarMemoType.Return:
      assertMemoHashOrReturn(trimmed, StellarMemoType.Return);
      return Memo.return(trimmed);
    case StellarMemoType.Text:
    default:
      assertMemoText(trimmed);
      return Memo.text(trimmed);
  }
}

function assertMemoText(value: string): void {
  if (new TextEncoder().encode(value).length > STELLAR_TEXT_MEMO_MAX_BYTES) {
    throw new Error(
      `Memo must be ${STELLAR_TEXT_MEMO_MAX_BYTES} bytes or fewer`,
    );
  }
}

function assertMemoId(value: string): void {
  if (!/^\d+$/u.test(value)) {
    throw new Error('Memo id must be a non-negative decimal integer');
  }
  try {
    const asId = BigInt(value);
    if (asId < 0n || asId > STELLAR_MEMO_ID_MAX) {
      throw new Error('Memo id is out of uint64 range');
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('Memo id')) {
      throw error;
    }
    throw new Error('Memo id must be a non-negative decimal integer');
  }
}

function assertMemoHashOrReturn(value: string, kind: 'hash' | 'return'): void {
  if (
    value.length !== STELLAR_MEMO_HASH_HEX_LENGTH ||
    !STELLAR_MEMO_HASH_HEX_PATTERN.test(value)
  ) {
    throw new Error(
      `Memo ${kind} must be a ${STELLAR_MEMO_HASH_HEX_LENGTH}-character hex string`,
    );
  }
}
