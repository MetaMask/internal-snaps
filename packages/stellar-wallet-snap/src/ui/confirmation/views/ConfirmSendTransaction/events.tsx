import type {
  UserInputUiEventHandler,
  UserInputUiEventHandlerContext,
} from '../../../../handlers/user-input/api';
import { resolveInterface } from '../../../../utils';
import { buildResolveResult, withLockedContext } from '../../utils';

export const ConfirmSendTransactionFormNames = {
  Cancel: 'confirm-send-transaction-cancel',
  Confirm: 'confirm-send-transaction-confirm',
} as const;

export type ConfirmSendTransactionFormNames =
  (typeof ConfirmSendTransactionFormNames)[keyof typeof ConfirmSendTransactionFormNames];

/**
 * Handles the click event for the cancel button.
 *
 * @param options - The user input handler context from `confirmSend`, with the latest interface context.
 * @returns A promise that resolves when the interface has been updated.
 */
async function onCancelButtonClick(
  options: UserInputUiEventHandlerContext,
): Promise<void> {
  const { id, context } = options;
  await resolveInterface(id, buildResolveResult(false, context));
}

/**
 * Handles the click event for the confirm button.
 *
 * @param options - The user input handler context from `confirmSend`, with the latest interface context.
 * @returns A promise that resolves when the interface has been updated.
 */
async function onConfirmButtonClick(
  options: UserInputUiEventHandlerContext,
): Promise<void> {
  const { id, context } = options;
  await resolveInterface(id, buildResolveResult(true, context));
}

/**
 * Create event handlers bound to a SnapClient instance.
 *
 * @returns Object containing event handlers.
 */
export function createEventHandlers(): Record<string, UserInputUiEventHandler> {
  return {
    [ConfirmSendTransactionFormNames.Cancel]:
      withLockedContext(onCancelButtonClick),
    [ConfirmSendTransactionFormNames.Confirm]:
      withLockedContext(onConfirmButtonClick),
  };
}
