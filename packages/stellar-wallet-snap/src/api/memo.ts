import { Memo } from '@stellar/stellar-sdk';

const STELLAR_TEXT_MEMO_MAX_BYTES = 28;
const STELLAR_MEMO_ID_MAX = 18446744073709551615n;
const STELLAR_MEMO_ID_PATTERN = /^\d+$/u;

/**
 * Thrown when a memo string cannot be attached as a Stellar text or id memo.
 */
export class InvalidMemoException extends Error {
  constructor(
    message = `Memo must be ${STELLAR_TEXT_MEMO_MAX_BYTES} bytes or fewer`,
  ) {
    super(message);
    this.name = 'InvalidMemoException';
  }
}

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
 * Narrows an unknown dialog/context memo value to a string when present.
 *
 * @param memo - Raw memo from dialog result or confirmation context.
 * @returns The memo string, or `undefined` when not a string.
 */
export function getMemoStrOrUndefined(memo: unknown): string | undefined {
  return typeof memo === 'string' ? memo : undefined;
}

/**
 * Builds a Stellar SDK {@link Memo} from a string value.
 *
 * All-digit uint64 values → {@link Memo.id}; otherwise {@link Memo.text}.
 * Empty / whitespace-only values are treated as absent.
 *
 * Used on the transaction build path (TransactionBuilder), not only UI.
 *
 * @param value - Raw memo string (e.g. from confirmation UI).
 * @returns SDK memo, or `null` when the value is empty / whitespace-only.
 * @throws {InvalidMemoException} When the value is neither a valid memo id nor text memo.
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

  throw new InvalidMemoException();
}
