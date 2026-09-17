import type { DialogResult } from '@metamask/snaps-sdk';
import { isObject } from '@metamask/utils';

import type {
  UserInputUiEventHandler,
  UserInputUiEventHandlerContext,
} from '../../../../handlers/user-input/api';
import { resolveInterface } from '../../../../utils';
import { memoFromContext } from '../../utils';

export const ConfirmSendTransactionFormNames = {
  Cancel: 'confirm-send-transaction-cancel',
  Confirm: 'confirm-send-transaction-confirm',
} as const;

export type ConfirmSendTransactionFormNames =
  (typeof ConfirmSendTransactionFormNames)[keyof typeof ConfirmSendTransactionFormNames];

export type ConfirmSendDialogResult = {
  confirmed: boolean;
  memo?: string | null;
};

/**
 * Parses the confirm-send dialog result (`{ confirmed, memo? }`, with boolean compat).
 *
 * @param result - Dialog result from `snap_resolveInterface`.
 * @returns Normalized confirmation + optional memo from the UI.
 */
export function parseConfirmSendDialogResult(
  result: DialogResult,
): ConfirmSendDialogResult {
  if (result === true) {
    return { confirmed: true };
  }
  if (result === false || result === null) {
    return { confirmed: false };
  }
  if (!isObject(result)) {
    return { confirmed: false };
  }

  const confirmed = Boolean(result.confirmed);
  const { memo: memoValue } = result;
  if (typeof memoValue === 'string' && memoValue.trim()) {
    return { confirmed, memo: memoValue.trim() };
  }
  if (memoValue === null) {
    return { confirmed, memo: null };
  }
  return { confirmed };
}

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
    memo: memoFromContext(context),
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
