import type { Json, JsonRpcRequest } from '@metamask/snaps-sdk';
import type { CaipAssetType } from '@metamask/utils';

/**
 * Unified send flow JSON-RPC methods shared by the network snaps.
 */
export const SendFlowMethod = {
  OnAddressInput: 'onAddressInput',
  OnAmountInput: 'onAmountInput',
  GetMaxSendableAmount: 'getMaxSendableAmount',
  ConfirmSend: 'confirmSend',
  ComputeFee: 'computeFee',
} as const;

export type SendFlowMethod =
  (typeof SendFlowMethod)[keyof typeof SendFlowMethod];

/**
 * Error codes returned by the unified send flow validation methods.
 */
export const SendFlowErrorCodes = {
  Required: 'Required',
  Invalid: 'Invalid',
  InsufficientBalance: 'InsufficientBalance',
  InsufficientBalanceToCoverFee: 'InsufficientBalanceToCoverFee',
} as const;

export type SendFlowErrorCode =
  (typeof SendFlowErrorCodes)[keyof typeof SendFlowErrorCodes];

/**
 * Response returned by `onAddressInput` and `onAmountInput`.
 */
export type SendFlowValidationResponse = {
  valid: boolean;
  errors: { code: SendFlowErrorCode }[];
};

/**
 * Response returned by `getMaxSendableAmount`.
 */
export type SendFlowGetMaxSendableAmountResponse = {
  amount: string;
};

export type SendFlowOnAddressInputParams = {
  value: string;
  [key: string]: unknown;
};

export type SendFlowOnAmountInputParams = {
  accountId: string;
  assetId: CaipAssetType;
  value: string;
  toAddress?: string;
  [key: string]: unknown;
};

export type SendFlowGetMaxSendableAmountParams = {
  accountId: string;
  assetId: CaipAssetType;
  toAddress?: string;
  [key: string]: unknown;
};

export type SendFlowConfirmSendParams = {
  fromAccountId: string;
  toAddress: string;
  amount: string;
  assetId: CaipAssetType;
  [key: string]: unknown;
};

export type SendFlowComputeFeeParams = {
  transaction: string;
  accountId: string;
  scope: string;
  options?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * Chain-specific implementations of the unified send flow methods.
 *
 * Snaps implement only the methods they support. The shared
 * {@link SendFlowRequestRouter} validates the request and dispatches to them.
 */
export type SendFlowHandlers = {
  onAddressInput?: (
    params: SendFlowOnAddressInputParams,
    request: JsonRpcRequest,
  ) => Promise<Json>;
  onAmountInput?: (
    params: SendFlowOnAmountInputParams,
    request: JsonRpcRequest,
  ) => Promise<Json>;
  getMaxSendableAmount?: (
    params: SendFlowGetMaxSendableAmountParams,
    request: JsonRpcRequest,
  ) => Promise<Json>;
  confirmSend?: (
    params: SendFlowConfirmSendParams,
    request: JsonRpcRequest,
  ) => Promise<Json>;
  computeFee?: (
    params: SendFlowComputeFeeParams,
    request: JsonRpcRequest,
  ) => Promise<Json>;
};
