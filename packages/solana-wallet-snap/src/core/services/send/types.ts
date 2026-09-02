import type { Infer } from '@metamask/superstruct';

import type {
  OnAddressInputRequestStruct,
  OnAmountInputRequestStruct,
  OnConfirmSendRequestStruct,
  ValidationResponseStruct,
} from '../../handlers/onClientRequest/validation';

export type OnConfirmSendRequest = Infer<typeof OnConfirmSendRequestStruct>;

export type OnAddressInputRequest = Infer<typeof OnAddressInputRequestStruct>;

export type OnAmountInputRequest = Infer<typeof OnAmountInputRequestStruct>;

export type ValidationResponse = Infer<typeof ValidationResponseStruct>;

export const SendErrorCodes = {
  Required: 'Required',
  Invalid: 'Invalid',
  InsufficientBalanceToCoverFee: 'InsufficientBalanceToCoverFee',
  InsufficientBalance: 'InsufficientBalance',
} as const;

export type SendErrorCodes =
  (typeof SendErrorCodes)[keyof typeof SendErrorCodes];
