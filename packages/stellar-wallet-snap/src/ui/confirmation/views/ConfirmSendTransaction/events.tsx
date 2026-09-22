import type {
  UserInputUiEventHandler,
  UserInputUiEventHandlerContext,
} from '../../../../handlers/user-input/api';
import { resolveInterface } from '../../../../utils';
import { getMemoFromContext } from '../../utils';

export const ConfirmSendTransactionFormNames = {
  Cancel: 'confirm-send-transaction-cancel',
  Confirm: 'confirm-send-transaction-confirm',
} as const;

export type ConfirmSendTransactionFormNames =
  (typeof ConfirmSendTransactionFormNames)[keyof typeof ConfirmSendTransactionFormNames];

/**
 * Handles the click event for the cancel button.
 *
 * @param options - The user input handler context from `confirmSend`.
 * @returns A promise that resolves when the interface has been updated.
 */
async function onCancelButtonClick(
  options: UserInputUiEventHandlerContext,
): Promise<void> {
  const { id } = options;
  await resolveInterface(id, { confirmed: false });
}

/**
 * Handles the click event for the confirm button.
 *
 * @param options - The user input handler context from `confirmSend`.
 * @returns A promise that resolves when the interface has been updated.
 */
async function onConfirmButtonClick(
  options: UserInputUiEventHandlerContext,
): Promise<void> {
  const { id, context } = options;
  await resolveInterface(id, {
    confirmed: true,
    memo: getMemoFromContext(context),
  });
}

/**
 * Create event handlers bound to a SnapClient instance.
 *
 * @returns Object containing event handlers.
 */
export function createEventHandlers(): Record<string, UserInputUiEventHandler> {
  return {
    [ConfirmSendTransactionFormNames.Cancel]: async (options) =>
      onCancelButtonClick(options),
    [ConfirmSendTransactionFormNames.Confirm]: async (options) =>
      onConfirmButtonClick(options),
  };
}
