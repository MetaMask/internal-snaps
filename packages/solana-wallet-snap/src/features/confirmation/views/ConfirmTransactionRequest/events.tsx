import { MaliciousAcknowledgementFormNames } from '@metamask/snap-networks-utils';
import type { InputChangeEvent } from '@metamask/snaps-sdk';

import {
  CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME,
  resolveInterface,
  updateInterface,
} from '../../../../core/utils/interface';
import { state } from '../../../../snapContext';
import { ConfirmTransactionRequest } from './ConfirmTransactionRequest';
import type { ConfirmTransactionRequestContext } from './types';
import { shouldDisableConfirmation } from './utils';

/**
 * Re-renders the interface with a patched context.
 *
 * @param id - The ID of the interface to update.
 * @param context - The current confirmation context.
 * @param patch - The context fields to override.
 */
async function reRender(
  id: string,
  context: ConfirmTransactionRequestContext,
  patch: Partial<ConfirmTransactionRequestContext>,
): Promise<void> {
  const nextContext: ConfirmTransactionRequestContext = {
    ...context,
    ...patch,
  };

  await updateInterface(
    id,
    <ConfirmTransactionRequest context={nextContext} />,
    nextContext,
  );
}

/**
 * Handles the click event for the show advanced button.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 * @param params.context - The current confirmation context.
 */
async function onShowAdvancedButtonClick({
  id,
  context,
}: {
  id: string;
  context: ConfirmTransactionRequestContext;
}): Promise<void> {
  await reRender(id, context, {
    advanced: {
      ...context.advanced,
      shown: !context.advanced.shown,
    },
  });
}

/**
 * Handles the click event for the cancel button.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 */
async function onCancelButtonClick({ id }: { id: string }): Promise<void> {
  await resolveInterface(id, false);
  await state.deleteKey(
    `mapInterfaceNameToId.${CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME}`,
  );
}

/**
 * Handles the click event for the confirm button.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 */
async function onConfirmButtonClick({ id }: { id: string }): Promise<void> {
  await resolveInterface(id, true);
  await state.deleteKey(
    `mapInterfaceNameToId.${CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME}`,
  );
}

/**
 * Opens the malicious acknowledgement screen when the user clicks "Review alert".
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 * @param params.context - The current confirmation context.
 */
async function onReviewAlertsButtonClick({
  id,
  context,
}: {
  id: string;
  context: ConfirmTransactionRequestContext;
}): Promise<void> {
  await reRender(id, context, {
    acknowledgementScreen: true,
    acknowledged: false,
  });
}

/**
 * Tracks the risk-acknowledgement checkbox so the "Confirm" button can enable.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 * @param params.event - The checkbox change event.
 * @param params.context - The current confirmation context.
 */
async function onAcknowledgeChange({
  id,
  event,
  context,
}: {
  id: string;
  event: InputChangeEvent;
  context: ConfirmTransactionRequestContext;
}): Promise<void> {
  const acknowledged = Boolean(event.value);
  await reRender(id, context, { acknowledged });
}

/**
 * Confirms the transaction after the user acknowledged the malicious-scan risk.
 *
 * The proceed button is already disabled in the UI until the box is checked;
 * this re-checks `acknowledged` defensively so we never resolve the interface
 * for an unacknowledged risk.
 *
 * It also re-applies the confirm block guard: while the user was on the
 * acknowledgement screen, a background refresher may have invalidated the
 * transaction or left the scan pending. Rather than silently swallowing the
 * click, we send the user back to the confirmation view where the disabled
 * Confirm button and the banner explain why they can't proceed.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 * @param params.context - The current confirmation context.
 */
async function onProceedButtonClick({
  id,
  context,
}: {
  id: string;
  context: ConfirmTransactionRequestContext;
}): Promise<void> {
  if (!context?.acknowledged) {
    return;
  }

  if (
    shouldDisableConfirmation({
      scanFetchStatus: context.scanFetchStatus,
      scan: context.scan,
    })
  ) {
    await reRender(id, context, {
      acknowledgementScreen: false,
      acknowledged: false,
    });
    return;
  }

  await onConfirmButtonClick({ id });
}

/**
 * Returns from the acknowledgement screen to the confirmation view.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 * @param params.context - The current confirmation context.
 */
async function onBackButtonClick({
  id,
  context,
}: {
  id: string;
  context: ConfirmTransactionRequestContext;
}): Promise<void> {
  await reRender(id, context, {
    acknowledgementScreen: false,
    acknowledged: false,
  });
}

export const ConfirmSignAndSendTransactionFormNames = {
  ShowAdvanced: 'confirm-sign-and-send-transaction-show-advanced',
  Cancel: 'confirm-sign-and-send-transaction-cancel',
  Confirm: 'confirm-sign-and-send-transaction-confirm',
} as const;

export type ConfirmSignAndSendTransactionFormNames =
  (typeof ConfirmSignAndSendTransactionFormNames)[keyof typeof ConfirmSignAndSendTransactionFormNames];

export const eventHandlers = {
  [ConfirmSignAndSendTransactionFormNames.ShowAdvanced]:
    onShowAdvancedButtonClick,
  [ConfirmSignAndSendTransactionFormNames.Cancel]: onCancelButtonClick,
  [ConfirmSignAndSendTransactionFormNames.Confirm]: onConfirmButtonClick,
  [MaliciousAcknowledgementFormNames.Review]: onReviewAlertsButtonClick,
  [MaliciousAcknowledgementFormNames.Acknowledge]: onAcknowledgeChange,
  [MaliciousAcknowledgementFormNames.Proceed]: onProceedButtonClick,
  [MaliciousAcknowledgementFormNames.Back]: onBackButtonClick,
};
