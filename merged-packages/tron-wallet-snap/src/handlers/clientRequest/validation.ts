import { AssetStruct, FeeType } from '@metamask/keyring-api';
import { literal } from '@metamask/snaps-sdk';
import type { Infer } from '@metamask/superstruct';
import {
  array,
  boolean,
  enums,
  is,
  object,
  refine,
  string,
} from '@metamask/superstruct';
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

/**
 * computeStakeFee request validation.
 */
export const ComputeStakeFeeRequestParamsStruct = object({
  fromAccountId: UuidStruct,
  value: PositiveNumberStringStruct,
  options: object({
    purpose: enums(['ENERGY', 'BANDWIDTH']),
  }),
});

export const ComputeStakeFeeRequestStruct = object({
  jsonrpc: JsonRpcVersionStruct,
  id: JsonRpcIdStruct,
  method: literal(ClientRequestMethod.ComputeStakeFee),
  params: ComputeStakeFeeRequestParamsStruct,
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

/**
 * Parses a base64-encoded rewards message.
 * Expected format: 'rewards,{address},{timestamp}'
 *
 * @param base64Message - The base64-encoded message to parse.
 * @returns The parsed address and timestamp.
 * @throws Error if the message format is invalid.
 */
export function parseRewardsMessage(base64Message: string): {
  address: string;
  timestamp: number;
} {
  // Decode the message from base64 to utf8
  // eslint-disable-next-line no-restricted-globals
  const decodedMessage = Buffer.from(base64Message, 'base64').toString('utf8');

  // Check if message starts with 'rewards,'
  if (!decodedMessage.startsWith('rewards,')) {
    throw new Error('Message must start with "rewards,"');
  }

  // Split the message into parts
  const parts = decodedMessage.split(',');
  if (parts.length !== 3) {
    throw new Error(
      'Message must have exactly 3 parts: rewards,{address},{timestamp}',
    );
  }

  const [prefix, addressPart, timestampPart] = parts;

  // Validate prefix (already checked above, but being explicit)
  if (prefix !== 'rewards') {
    throw new Error('Message must start with "rewards"');
  }

  // Validate Tron address
  if (!is(addressPart, TronAddressStruct)) {
    throw new Error('Invalid Tron address');
  }

  // Validate timestamp
  if (!is(timestampPart, PositiveNumberStringStruct)) {
    throw new Error('Invalid timestamp format');
  }

  // Ensure timestamp is an integer (no decimals)
  if (timestampPart.includes('.')) {
    throw new Error('Invalid timestamp');
  }

  const timestamp = parseInt(timestampPart, 10);
  if (timestamp <= 0) {
    throw new Error('Invalid timestamp');
  }

  return {
    address: addressPart,
    timestamp,
  };
}

/**
 * Validates that a base64-encoded message follows the rewards format:
 * 'rewards,{address},{timestamp}'
 * - Must be valid base64
 * - When decoded, must start with 'rewards,'
 * - Must contain a valid Tron address
 * - Must contain a valid timestamp
 */
export const RewardsMessageStruct = refine(
  Base64Struct,
  'RewardsMessage',
  (value: string) => {
    try {
      parseRewardsMessage(value);
      return true;
    } catch (error) {
      return error instanceof Error ? error.message : 'Invalid rewards message';
    }
  },
);

/**
 * signRewardsMessage request/response validation.
 */
export const SignRewardsMessageRequestParamsStruct = object({
  accountId: UuidStruct,
  message: RewardsMessageStruct,
});

export const SignRewardsMessageRequestStruct = object({
  jsonrpc: JsonRpcVersionStruct,
  id: JsonRpcIdStruct,
  method: literal(ClientRequestMethod.SignRewardsMessage),
  params: SignRewardsMessageRequestParamsStruct,
});
