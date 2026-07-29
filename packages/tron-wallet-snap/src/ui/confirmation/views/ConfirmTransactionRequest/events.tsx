import type { SnapClient } from '../../../../clients/snap/SnapClient';

/**
 * Handle cancel button click by resolving the interface with a falsy value.
 *
 * @param snapClient - The SnapClient instance for API interactions.
 * @param options - The options bag.
 * @param options.id - The interface id.
 */
async function onCancelButtonClick(
  snapClient: SnapClient,
  options: { id: string },
): Promise<void> {
  const { id } = options;
  await snapClient.resolveInterface(id, false);
}

/**
 * Handle confirm button click by resolving the interface with a truthy value.
 *
 * @param snapClient - The SnapClient instance for API interactions.
 * @param options - The options bag.
 * @param options.id - The interface id.
 */
async function onConfirmButtonClick(
  snapClient: SnapClient,
  options: { id: string },
): Promise<void> {
  const { id } = options;
  await snapClient.resolveInterface(id, true);
}

export enum ConfirmSignAndSendTransactionFormNames {
  Cancel = 'confirm-sign-and-send-transaction-cancel',
  Confirm = 'confirm-sign-and-send-transaction-confirm',
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
    [ConfirmSignAndSendTransactionFormNames.Cancel]: async (options: {
      id: string;
    }) => onCancelButtonClick(snapClient, options),
    [ConfirmSignAndSendTransactionFormNames.Confirm]: async (options: {
      id: string;
    }) => onConfirmButtonClick(snapClient, options),
  };
}
