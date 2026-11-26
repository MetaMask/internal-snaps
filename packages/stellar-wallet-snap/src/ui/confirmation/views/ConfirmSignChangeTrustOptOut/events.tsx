import type {
  UserInputUiEventHandler,
  UserInputUiEventHandlerContext,
} from '../../../../handlers/user-input/api';
import { resolveInterface } from '../../../../utils';
import { buildResolveResult, withLockedContext } from '../../utils';

/**
 * Handles the click event for the cancel button.
 *
 * @param options - The user input handler context from `onUserInput`, with the latest interface context.
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
 * @param options - The user input handler context from `onUserInput`, with the latest interface context.
 * @returns A promise that resolves when the interface has been updated.
 */
async function onConfirmButtonClick(
  options: UserInputUiEventHandlerContext,
): Promise<void> {
  const { id, context } = options;
  await resolveInterface(id, buildResolveResult(true, context));
}

export const ConfirmSignChangeTrustOptOutFormNames = {
  Cancel: 'confirm-sign-change-trust-opt-out-cancel',
  Confirm: 'confirm-sign-change-trust-opt-out-confirm',
} as const;

export type ConfirmSignChangeTrustOptOutFormNames =
  (typeof ConfirmSignChangeTrustOptOutFormNames)[keyof typeof ConfirmSignChangeTrustOptOutFormNames];

/**
 * Create event handlers bound to a SnapClient instance.
 *
 * @returns Object containing event handlers.
 */
export function createEventHandlers(): Record<string, UserInputUiEventHandler> {
  return {
    [ConfirmSignChangeTrustOptOutFormNames.Cancel]:
      withLockedContext(onCancelButtonClick),
    [ConfirmSignChangeTrustOptOutFormNames.Confirm]:
      withLockedContext(onConfirmButtonClick),
  };
}
