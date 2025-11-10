import { AssetStruct, FeeType } from '@metamask/keyring-api';
import { literal } from '@metamask/snaps-sdk';
import type { Infer } from '@metamask/superstruct';
import { array, boolean, enums, object, string } from '@metamask/superstruct';
import {
  CaipAssetTypeStruct,
  JsonRpcIdStruct,
  JsonRpcVersionStruct,
} from '@metamask/utils';

import { ClientRequestMethod, SendErrorCodes } from './types';
import { NativeCaipAssetTypeStruct } from '../../services/assets/types';
import {
  Base64Struct,
  PositiveNumberStringStruct,
  ScopeStringStruct,
  TronAddressStruct,
  UuidStruct,
} from '../../validation/structs';

/**
 * signAndSendTransaction request/response validation.
 */
export const SignAndSendTransactionRequestParamsStruct = object({
  transaction: Base64Struct,
  accountId: UuidStruct,
  scope: ScopeStringStruct,
  options: object({
    visible: boolean(),
    type: string(),
  }),
});

export const SignAndSendTransactionRequestStruct = object({
  jsonrpc: JsonRpcVersionStruct,
  id: JsonRpcIdStruct,
  method: literal(ClientRequestMethod.SignAndSendTransaction),
  params: SignAndSendTransactionRequestParamsStruct,
});

/**
 * onConfirmSend request/response validation.
 */
export const OnConfirmSendRequestParamsStruct = object({
  fromAccountId: UuidStruct,
  toAddress: TronAddressStruct,
  amount: PositiveNumberStringStruct,
  assetId: CaipAssetTypeStruct,
});

export const OnConfirmSendRequestStruct = object({
  jsonrpc: JsonRpcVersionStruct,
  id: JsonRpcIdStruct,
  method: literal(ClientRequestMethod.ConfirmSend),
  params: OnConfirmSendRequestParamsStruct,
});

/**
 * onAddressInput request/response validation.
 */
export const OnAddressInputRequestParamsStruct = object({
  value: TronAddressStruct,
});

export const OnAddressInputRequestStruct = object({
  jsonrpc: JsonRpcVersionStruct,
  id: JsonRpcIdStruct,
  method: literal(ClientRequestMethod.OnAddressInput),
  params: OnAddressInputRequestParamsStruct,
});

/**
 * onAmountInput request/response validation.
 */
export const OnAmountInputRequestParamsStruct = object({
  accountId: UuidStruct,
  assetId: CaipAssetTypeStruct,
  value: PositiveNumberStringStruct,
});

export const OnAmountInputRequestStruct = object({
  jsonrpc: JsonRpcVersionStruct,
  id: JsonRpcIdStruct,
  method: literal(ClientRequestMethod.OnAmountInput),
  params: OnAmountInputRequestParamsStruct,
});

export const ValidationResponseStruct = object({
  valid: boolean(),
  errors: array(
    object({
      code: enums(Object.values(SendErrorCodes)),
    }),
  ),
});

export type ValidationResponse = Infer<typeof ValidationResponseStruct>;

/**
 * computeFee request/response validation.
 */
export const ComputeFeeRequestParamsStruct = object({
  transaction: Base64Struct,
  accountId: UuidStruct,
  scope: ScopeStringStruct,
  options: object({
    visible: boolean(),
    type: string(),
  }),
});

export const ComputeFeeRequestStruct = object({
  jsonrpc: JsonRpcVersionStruct,
  id: JsonRpcIdStruct,
  method: literal(ClientRequestMethod.ComputeFee),
  params: ComputeFeeRequestParamsStruct,
});

export const ComputeFeeResponseStruct = array(
  object({
    type: enums(Object.values(FeeType)),
    asset: AssetStruct,
  }),
);

export type ComputeFeeResponse = Infer<typeof ComputeFeeResponseStruct>;

export const OnStakeAmountInputRequestParamsStruct = object({
  accountId: UuidStruct,
  assetId: NativeCaipAssetTypeStruct,
  value: PositiveNumberStringStruct,
});

export const OnStakeAmountInputRequestStruct = object({
  jsonrpc: JsonRpcVersionStruct,
  id: JsonRpcIdStruct,
  method: literal(ClientRequestMethod.OnStakeAmountInput),
  params: OnStakeAmountInputRequestParamsStruct,
});

export const OnConfirmStakeRequestParamsStruct = object({
  fromAccountId: UuidStruct,
  assetId: NativeCaipAssetTypeStruct,
  value: PositiveNumberStringStruct,
  options: object({
    purpose: enums(['ENERGY', 'BANDWIDTH']),
  }),
});

export const OnConfirmStakeRequestStruct = object({
  jsonrpc: JsonRpcVersionStruct,
  id: JsonRpcIdStruct,
  method: literal(ClientRequestMethod.ConfirmStake),
  params: OnConfirmStakeRequestParamsStruct,
});

export const OnUnstakeAmountInputRequestParamsStruct = object({
  accountId: UuidStruct,
  assetId: NativeCaipAssetTypeStruct,
  options: object({
    purpose: enums(['ENERGY', 'BANDWIDTH']),
  }),
  value: PositiveNumberStringStruct,
});

export const OnUnstakeAmountInputRequestStruct = object({
  jsonrpc: JsonRpcVersionStruct,
  id: JsonRpcIdStruct,
  method: literal(ClientRequestMethod.OnUnstakeAmountInput),
  params: OnUnstakeAmountInputRequestParamsStruct,
});

export const OnConfirmUnstakeRequestParamsStruct = object({
  accountId: UuidStruct,
  assetId: NativeCaipAssetTypeStruct,
  options: object({
    purpose: enums(['ENERGY', 'BANDWIDTH']),
  }),
  value: PositiveNumberStringStruct,
});

export const OnConfirmUnstakeRequestStruct = object({
  jsonrpc: JsonRpcVersionStruct,
  id: JsonRpcIdStruct,
  method: literal(ClientRequestMethod.ConfirmUnstake),
  params: OnConfirmUnstakeRequestParamsStruct,
});
