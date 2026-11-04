import type { Struct } from '@metamask/superstruct';
import {
  array,
  boolean,
  enums,
  object,
  optional,
  pattern,
  record,
  string,
  unknown,
} from '@metamask/superstruct';
import { CaipAssetTypeStruct } from '@metamask/utils';

import { UuidStruct } from '../uuidStruct/uuidStruct';
import { SendFlowErrorCodes } from './types';

/**
 * A positive decimal string, as used by the unified send flow amounts.
 */
export const PositiveNumberStringStruct = pattern(
  string(),
  /^(?!0\d)(\d+(\.\d+)?)$/u,
);

/**
 * A Base64-encoded string, as used by the unified send flow transactions.
 */
export const Base64Struct = pattern(
  string(),
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)$/u,
);

/**
 * Validation response shared by `onAddressInput` and `onAmountInput`.
 */
export const SendFlowValidationResponseStruct = object({
  valid: boolean(),
  errors: array(
    object({
      code: enums(Object.values(SendFlowErrorCodes)),
    }),
  ),
});

/**
 * Response shared by `getMaxSendableAmount`.
 */
export const SendFlowGetMaxSendableAmountResponseStruct = object({
  amount: PositiveNumberStringStruct,
});

/**
 * Params structs for the unified send flow methods.
 *
 * `any` is used because superstruct structs are contravariant in their output
 * type, and the concrete params type differs per chain. The concrete types are
 * applied by the shared handler signatures.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/naming-convention */
export type SendFlowStructs = {
  OnAddressInputParams: Struct<any>;
  OnAmountInputParams: Struct<any>;
  GetMaxSendableAmountParams: Struct<any>;
  ConfirmSendParams: Struct<any>;
  ComputeFeeParams: Struct<any>;
};
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/naming-convention */

export type SendFlowParamStructOverrides = Partial<SendFlowStructs>;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CreateSendFlowStructsOptions = {
  /**
   * CAIP-19 asset struct for the local chain. Snaps should refine
   * `CaipAssetTypeStruct` so asset IDs from other chains are rejected.
   */
  assetId?: Struct<any>;
  /**
   * Address struct for the local chain.
   */
  address: Struct<any>;
  /**
   * Amount struct for the local chain. Defaults to a positive decimal string.
   */
  amount?: Struct<any>;
  /**
   * Transaction struct for `computeFee`. Defaults to a Base64 string.
   */
  transaction?: Struct<any>;
  /**
   * Overrides for the params of a specific method. Use this for fields that
   * differ per chain, such as `to` vs `toAddress` or a required `options`.
   */
  overrides?: SendFlowParamStructOverrides;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Builds the params structs shared by the unified send flow methods.
 *
 * Chain-specific CAIP asset, address, amount, and transaction validation is
 * supplied by the caller so each snap only overrides the parts that differ.
 *
 * @param options - Chain-specific structs and optional per-method overrides.
 * @returns The params structs for every unified send flow method.
 */
export function createSendFlowStructs(
  options: CreateSendFlowStructsOptions,
): SendFlowStructs {
  const assetId = options.assetId ?? CaipAssetTypeStruct;
  const amount = options.amount ?? PositiveNumberStringStruct;
  const transaction = options.transaction ?? Base64Struct;
  const { address, overrides = {} } = options;

  return {
    OnAddressInputParams:
      overrides.OnAddressInputParams ?? object({ value: address }),
    OnAmountInputParams:
      overrides.OnAmountInputParams ??
      object({
        accountId: UuidStruct,
        assetId,
        value: amount,
        toAddress: optional(address),
      }),
    GetMaxSendableAmountParams:
      overrides.GetMaxSendableAmountParams ??
      object({
        accountId: UuidStruct,
        assetId,
        toAddress: optional(address),
      }),
    ConfirmSendParams:
      overrides.ConfirmSendParams ??
      object({
        fromAccountId: UuidStruct,
        toAddress: address,
        amount,
        assetId,
      }),
    ComputeFeeParams:
      overrides.ComputeFeeParams ??
      object({
        transaction,
        accountId: UuidStruct,
        scope: string(),
        options: optional(record(string(), unknown())),
      }),
  };
}
