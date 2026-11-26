import {
  coerce,
  Infer,
  refine,
  union,
  integer,
  string,
} from '@metamask/superstruct';
import { definePattern, HexStruct } from '@metamask/utils';
import { decode, validate } from 'xrpl';

import { UnSigned32BitIntegerStruct } from './amount';

export const XrplTransactionStringStruct = refine(
  HexStruct,
  'xrpl_transaction_string',
  (value: string) => {
    try {
      // 1. Decode binary hex into JSON (throws if binary structure/canonical order is invalid)
      const tx = decode(value);
      // 2. Validate transaction fields, types, and required properties
      validate(tx);
      return true;
    } catch {
      return 'Invalid XRPL transaction blob';
    }
  },
);

/**
 * Validation struct for Xrpl transaction hashes returned by RPC.
 */
export const XrplTransactionHashStruct = definePattern(
  'XrplTransactionHash',
  /^[0-9a-f]{64}$/iu,
);

/**
 * XRPL `DestinationTag` (UInt32).
 *
 * Accepts a number or a decimal digit string (confirmation form input).
 * Use {@link ValidDestinationTagStruct.create} to coerce/validate; blank /
 * missing values should be handled by the caller before calling `create`.
 */
export const ValidDestinationTagStruct = coerce(
  UnSigned32BitIntegerStruct,
  union([integer(), string()]),
  (value: number | string): number => {
    if (typeof value === 'number') {
      return value;
    }
    const trimmed = value.trim();
    if (!/^\d+$/u.test(trimmed)) {
      return Number.NaN;
    }
    return Number(trimmed);
  },
);

export type ValidDestinationTag = Infer<typeof ValidDestinationTagStruct>;

export type TransactionId = Infer<typeof XrplTransactionHashStruct>;

export type XrplTransactionString = Infer<typeof XrplTransactionStringStruct>;
