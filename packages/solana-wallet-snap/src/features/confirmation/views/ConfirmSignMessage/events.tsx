import { resolveInterface } from '../../../../core/utils/interface';

/**
 * Handles the click event for the cancel button.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 */
async function onCancelButtonClick({ id }: { id: string }) {
  await resolveInterface(id, false);
}

/**
 * Handles the click event for the confirm button.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 */
async function onConfirmButtonClick({ id }: { id: string }) {
  await resolveInterface(id, true);
}

export const ConfirmSignMessageFormNames = {
  Cancel: 'confirm-sign-message-cancel',
  Confirm: 'confirm-sign-message-confirm',
} as const;

export type ConfirmSignMessageFormNames =
  (typeof ConfirmSignMessageFormNames)[keyof typeof ConfirmSignMessageFormNames];

export const eventHandlers = {
  [ConfirmSignMessageFormNames.Cancel]: onCancelButtonClick,
  [ConfirmSignMessageFormNames.Confirm]: onConfirmButtonClick,
};
