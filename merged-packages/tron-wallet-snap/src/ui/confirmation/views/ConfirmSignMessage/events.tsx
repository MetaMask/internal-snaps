import type { SnapClient } from '../../../../clients/snap/SnapClient';

/**
 * Handles the click event for the cancel button.
 *
 * @param snapClient - The SnapClient instance for API interactions.
 * @param options - The options bag.
 * @param options.id - The interface id.
 * @returns A promise that resolves when the interface has been updated.
 */
async function onCancelButtonClick(
  snapClient: SnapClient,
  options: { id: string },
): Promise<void> {
  const { id } = options;
  await snapClient.resolveInterface(id, false);
}

/**
 * Handles the click event for the confirm button.
 *
 * @param snapClient - The SnapClient instance for API interactions.
 * @param options - The options bag.
 * @param options.id - The interface id.
 * @returns A promise that resolves when the interface has been updated.
 */
async function onConfirmButtonClick(
  snapClient: SnapClient,
  options: { id: string },
): Promise<void> {
  const { id } = options;
  await snapClient.resolveInterface(id, true);
}

export enum ConfirmSignMessageFormNames {
  Cancel = 'confirm-sign-message-cancel',
  Confirm = 'confirm-sign-message-confirm',
}

/**
 * Create event handlers bound to a SnapClient instance.
 *
 * @param snapClient - The SnapClient instance for API interactions.
 * @returns Object containing event handlers.
 */
export function createEventHandlers(
  snapClient: SnapClient,
): Record<string, (options: { id: string }) => Promise<void>> {
  return {
    [ConfirmSignMessageFormNames.Cancel]: async (options: { id: string }) =>
      onCancelButtonClick(snapClient, options),
    [ConfirmSignMessageFormNames.Confirm]: async (options: { id: string }) =>
      onConfirmButtonClick(snapClient, options),
  };
}
