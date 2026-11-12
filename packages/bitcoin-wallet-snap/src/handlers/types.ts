import type { Infer } from 'superstruct';

import type {
  ConfirmSendRequestStruct,
  GetMaxSendableAmountRequestStruct,
  GetMaxSendableAmountResponseStruct,
  OnAddressInputRequestStruct,
  OnAmountInputRequestStruct,
} from './validation';

export type OnAddressInputRequest = Infer<typeof OnAddressInputRequestStruct>;
export type OnAmountInputRequest = Infer<typeof OnAmountInputRequestStruct>;
export type GetMaxSendableAmountRequest = Infer<
  typeof GetMaxSendableAmountRequestStruct
>;
export type GetMaxSendableAmountResponse = Infer<
  typeof GetMaxSendableAmountResponseStruct
>;
export type ConfirmSendRequest = Infer<typeof ConfirmSendRequestStruct>;
