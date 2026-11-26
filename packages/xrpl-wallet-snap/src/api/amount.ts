import {
  integer,
  nonempty,
  min,
  refine,
  string,
  size,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { BigNumber } from 'bignumber.js';

import {
  IOU_DECIMAL_PLACES,
  MAX_DROPS,
  XRPL_DECIMAL_PLACES,
  MAX_IOU,
} from '../constants';
import { toSmallestUnit } from '../utils/currency';

/**
 * Non-empty string that parses to a finite, non-negative {@link BigNumber}.
 */
export const UnSignedNumberStringStruct = refine(
  nonempty(string()),
  'valid_amount',
  (value: string) => {
    try {
      const amount = new BigNumber(value);
      if (
        // < 0
        amount.isNegative() ||
        // NaN or Infinity
        amount.isNaN() ||
        !amount.isFinite()
      ) {
        return 'Invalid amount';
      }
      return true;
    } catch {
      return 'Invalid amount';
    }
  },
);

/**
 * Non-empty string that parses to a finite, signed {@link BigNumber}.
 */
export const SignedNumberStringStruct = refine(
  nonempty(string()),
  'signed_number_string',
  (value) => {
    const amount = new BigNumber(value);
    if (amount.isNaN() || !amount.isFinite()) {
      return 'Invalid numeric string';
    }
    return true;
  },
);

export const NonZeroValidXrplAmountStruct = refine(
  UnSignedNumberStringStruct,
  'non_zero_valid_xrpl_amount',
  (value: string) => {
    try {
      const amount = new BigNumber(value);
      if (amount.isZero()) {
        return 'Amount cannot be zero';
      }
      return true;
    } catch {
      return 'Invalid amount';
    }
  },
);

export const UnSignedIntegerStringStruct = refine(
  nonempty(string()),
  'un_signed_integer_string',
  (value: string) => {
    const amount = new BigNumber(value);
    if (!amount.isFinite() || amount.isNegative() || !amount.isInteger()) {
      return 'Invalid amount';
    }
    return true;
  },
);

/**
 * Non-empty string that parses to a finite, non-negative {@link BigNumber} and is not above the maximum int64.
 * The amount is converted to the smallest unit of the asset and validated against the maximum int64.
 */
export const ValidXrplAmountStruct = refine(
  UnSignedNumberStringStruct,
  'valid_xrpl_amount',
  (value: string) => {
    try {
      const amount = new BigNumber(value);
      const decimalPlaces = amount.decimalPlaces();
      if (
        (decimalPlaces && decimalPlaces > XRPL_DECIMAL_PLACES) ||
        // > Max value
        toSmallestUnit(amount).gt(MAX_DROPS)
      ) {
        return 'Invalid amount';
      }
      return true;
    } catch {
      return 'Invalid amount';
    }
  },
);

export const ValidMptAmountStruct = UnSignedNumberStringStruct;

/**
 * IOU amount in currency units (not drops). Accepts signed values for ledger
 * balances; send paths should reject non-positive amounts separately.
 */
export const ValidIouAmountStruct = refine(
  SignedNumberStringStruct,
  'valid_iou_amount',
  (value: string) => {
    try {
      const amount = new BigNumber(value);
      const decimalPlaces = amount.decimalPlaces();
      if (
        (decimalPlaces && decimalPlaces > IOU_DECIMAL_PLACES) ||
        // IOU `Amount.value` is not drop-scaled.
        amount.abs().gt(MAX_IOU)
      ) {
        return 'Invalid amount';
      }
      return true;
    } catch {
      return 'Invalid amount';
    }
  },
);

/**
 * Non-empty non-negative integer string already in smallest units (drops /
 * trustline limit), not above {@link MAX_DROPS}. Does not scale by decimals.
 */
export const ValidXrplDropsStruct = refine(
  UnSignedNumberStringStruct,
  'valid_xrpl_drops',
  (value: string) => {
    try {
      const amount = new BigNumber(value);
      if (!amount.isInteger() || amount.gt(MAX_DROPS)) {
        return 'Invalid amount';
      }
      return true;
    } catch {
      return 'Invalid amount';
    }
  },
);

export const UnSignedIntegerStruct = min(integer(), 0);

export type UnSignedInteger = Infer<typeof UnSignedIntegerStruct>;

export const UnSigned32BitIntegerStruct = size(integer(), 0, 4294967295);

export type UnSigned32BitInteger = Infer<typeof UnSigned32BitIntegerStruct>;

export type NonZeroValidXrplAmount = Infer<typeof NonZeroValidXrplAmountStruct>;

export type ValidXrplDrops = Infer<typeof ValidXrplDropsStruct>;

export type UnSignedNumberString = Infer<typeof UnSignedNumberStringStruct>;

export type SignedNumberString = Infer<typeof SignedNumberStringStruct>;

export type ValidXrplAmount = Infer<typeof ValidXrplAmountStruct>;

export type ValidMptAmount = Infer<typeof ValidMptAmountStruct>;

export type ValidIouAmount = Infer<typeof ValidIouAmountStruct>;
