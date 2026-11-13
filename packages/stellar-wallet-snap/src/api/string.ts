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
 * Stellar memo kinds accepted on the `confirmSend` wire params.
 *
 * When `memoType` is omitted, the builder infers `MEMO_ID` for all-digit uint64
 * values and `MEMO_TEXT` otherwise.
 */
export const StellarMemoType = {
  Text: 'MEMO_TEXT',
  Id: 'MEMO_ID',
} as const;

/**
 * Validation struct for {@link StellarMemoType}.
 */
export const StellarMemoTypeStruct = enums([
  StellarMemoType.Text,
  StellarMemoType.Id,
]);

export type StellarMemoType = Infer<typeof StellarMemoTypeStruct>;

/**
 * Loose wire-layer memo value: text and uint64 id values both pass.
 * Strict type and length checks run in `resolveStellarMemo` at build time.
 */
export const StellarMemoValueStruct = refine(
  string(),
  'stellar-memo-value',
  (value) => (value.length <= 64 ? true : 'Memo is too long'),
);

export type StellarMemoValue = Infer<typeof StellarMemoValueStruct>;
