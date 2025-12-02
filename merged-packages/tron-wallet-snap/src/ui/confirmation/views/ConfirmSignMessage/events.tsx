import snapContext from '../../../../context';

/**
 * Handles the click event for the cancel button.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 * @returns A promise that resolves when the interface has been updated.
 */
async function onCancelButtonClick({ id }: { id: string }): Promise<void> {
  await snapContext.snapClient.resolveInterface(id, false);
}

/**
 * Handles the click event for the confirm button.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 * @returns A promise that resolves when the interface has been updated.
 */
async function onConfirmButtonClick({ id }: { id: string }): Promise<void> {
  await snapContext.snapClient.resolveInterface(id, true);
}

export enum ConfirmSignMessageFormNames {
  Cancel = 'confirm-sign-message-cancel',
  Confirm = 'confirm-sign-message-confirm',
}

export const eventHandlers = {
  [ConfirmSignMessageFormNames.Cancel]: onCancelButtonClick,
  [ConfirmSignMessageFormNames.Confirm]: onConfirmButtonClick,
};
