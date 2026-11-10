import { Memo } from '@stellar/stellar-sdk';

import { StellarMemoType } from '../../api';
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
 * Builds a Stellar SDK {@link Memo} from a string value and optional type.
 *
 * An explicit `type` wins, so numeric text stays text. Otherwise all-digit
 * uint64 values → {@link Memo.id} and everything else → {@link Memo.text}.
 * Empty / whitespace-only values are treated as absent.
 *
 * Used on the transaction build path (TransactionBuilder), not only UI.
 *
 * @param value - Raw memo from the client request, confirmation UI, or interface context.
 * @param type - Optional explicit memo type. When omitted, the type is inferred.
 * @returns SDK memo, or `null` when the value is missing, non-string, or whitespace-only.
 * @throws {InvalidMemoException} When the value is invalid for the resolved type.
 */
export function resolveStellarMemo(
  value: unknown,
  type?: StellarMemoType | null,
): Memo | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    const resolvedType =
      type ?? (isMemoId(trimmed) ? StellarMemoType.Id : StellarMemoType.Text);

    switch (resolvedType) {
      case StellarMemoType.Id:
        if (!isMemoId(trimmed)) {
          throw new Error('Invalid memo');
        }
        return Memo.id(trimmed);
      case StellarMemoType.Text:
        if (!isMemoText(trimmed)) {
          throw new Error('Invalid memo');
        }
        return Memo.text(trimmed);
      default:
        throw new Error('Invalid memo');
    }
  } catch {
    throw new InvalidMemoException();
  }
}
