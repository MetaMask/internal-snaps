import type { Infer } from '@metamask/superstruct';
import { refine, string } from '@metamask/superstruct';
import { definePattern } from '@metamask/utils';

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

/**
 * Validation struct for a 32-byte hex: ledger hash, ledger-entry index, or credential id.
 */
export const Hash256Struct = definePattern('Hash256', /^[0-9A-Fa-f]{64}$/u);

export type Utf8String = Infer<typeof Utf8StringStruct>;

export type Hash256 = Infer<typeof Hash256Struct>;
