import type { SecurityAlertResponse } from '@metamask/snap-networks-utils';
import {
  MaliciousAcknowledgementFormNames,
  requiresMaliciousAcknowledgement,
  serialize,
} from '@metamask/snap-networks-utils';
import type { UserInputEvent } from '@metamask/snaps-sdk';
import { UserInputEventType } from '@metamask/snaps-sdk';

import {
  CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME,
  getInterfaceContext,
  resolveInterface,
  updateInterface,
  withInterfaceLock,
} from '../../../../core/utils/interface';
import { state } from '../../../../snapContext';
import { ConfirmTransactionRequest } from './ConfirmTransactionRequest';
import type { ConfirmTransactionRequestContext as Context } from './types';
import { shouldDisableConfirmation, toUiContext } from './utils';

/**
 * Re-renders the interface with a patched context.
 *
 * @param id - The ID of the interface to update.
 * @param context - The current confirmation context.
 * @param patch - The context fields to override.
 */
async function reRender(
  id: string,
  context: Context,
  patch: Partial<Context>,
): Promise<void> {
  const nextContext: Context = {
    ...context,
    ...patch,
  };

  await updateInterface(
    id,
    <ConfirmTransactionRequest context={toUiContext(nextContext)} />,
    nextContext,
  );
}

/**
 * Applies an update to the latest stored context while holding the interface
 * lock.
 *
 * The context passed with an event is captured when the event is dispatched.
 * A background refresh or another event can update the interface before this
 * handler runs, so the update reads the stored context inside the lock and
 * skips the update if the interface no longer has a context.
 *
 * @param id - The ID of the interface to update.
 * @param update - Applies the change to the latest context.
 */
async function updateLatestContext(
  id: string,
  update: (context: Context) => Promise<void>,
): Promise<void> {
  await withInterfaceLock(id, async () => {
    const context = await getInterfaceContext<Context>(id);

    if (!context) {
      return;
    }

    await update(context);
  });
}

/**
 * Resolves the confirmation interface with the user's result and the latest
 * stored context, then clears its mapping. Render computes the security
 * verdict from that context.
 *
 * The context must be read under the interface lock, so it is the context the
 * user acted on. The interface is deleted once it resolves, so the context
 * cannot be read afterward.
 *
 * @param id - The ID of the interface to resolve.
 * @param result - Whether the user confirmed the transaction.
 * @param context - The latest stored context, or `null` if there is none.
 */
async function resolveResult(
  id: string,
  result: boolean,
  context: Context | null,
): Promise<void> {
  await resolveInterface(id, {
    result,
    context: context === null ? null : serialize(context),
  });
  await state.deleteKey(
    `mapInterfaceNameToId.${CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME}`,
  );
}

/**
 * Handles the click event for the show advanced button.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 */
async function onShowAdvancedButtonClick({
  id,
}: {
  id: string;
}): Promise<void> {
  await updateLatestContext(id, async (context) => {
    await reRender(id, context, {
      advanced: {
        ...context.advanced,
        shown: !context.advanced.shown,
      },
    });
  });
}

/**
 * Handles the click event for the cancel button.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 */
async function onCancelButtonClick({ id }: { id: string }): Promise<void> {
  await withInterfaceLock(id, async () => {
    const context = await getInterfaceContext<Context>(id);

    await resolveResult(id, false, context);
  });
}

/**
 * Handles the click event for the confirm button.
 *
 * The latest context is checked under the interface lock. A background refresh
 * can block the transaction or require acknowledgement after this button was
 * rendered, so a click for that earlier render must not confirm it. Nothing is
 * resolved in that case, and the confirmation view shows the current state.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 */
async function onConfirmButtonClick({ id }: { id: string }): Promise<void> {
  await withInterfaceLock(id, async () => {
    const context = await getInterfaceContext<Context>(id);

    if (!context || shouldDisableConfirmation(context)) {
      return;
    }

    const requiresAcknowledgement = requiresMaliciousAcknowledgement(
      context.preferences.useSecurityAlerts,
      context.scan?.validation?.type as SecurityAlertResponse,
    );

    if (requiresAcknowledgement) {
      return;
    }

    await resolveResult(id, true, context);
  });
}

/**
 * Opens malicious acknowledgement when the user clicks the danger Confirm button.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 */
async function onOpenAcknowledgementButtonClick({
  id,
}: {
  id: string;
}): Promise<void> {
  await updateLatestContext(id, async (context) => {
    await reRender(id, context, {
      acknowledgementScreen: true,
      acknowledged: false,
    });
  });
}

/**
 * Tracks the risk-acknowledgement checkbox so the "Confirm" button can enable.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 * @param params.event - The checkbox change event.
 */
async function onAcknowledgeChange({
  id,
  event,
}: {
  id: string;
  event: UserInputEvent;
}): Promise<void> {
  if (event.type !== UserInputEventType.InputChangeEvent) {
    return;
  }

  const acknowledged = Boolean(event.value);
  await updateLatestContext(id, async (context) => {
    await reRender(id, context, { acknowledged });
  });
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
 * The check and the resolve run under the interface lock, using the latest
 * stored context rather than the context captured with the event.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 */
async function onProceedButtonClick({ id }: { id: string }): Promise<void> {
  await withInterfaceLock(id, async () => {
    const context = await getInterfaceContext<Context>(id);

    if (!context?.acknowledged) {
      return;
    }

    if (shouldDisableConfirmation(context)) {
      await reRender(id, context, {
        acknowledgementScreen: false,
        acknowledged: false,
      });
      return;
    }

    await resolveResult(id, true, context);
  });
}

/**
 * Returns from the acknowledgement screen to the confirmation view.
 *
 * @param params - The parameters for the function.
 * @param params.id - The ID of the interface to update.
 */
async function onBackButtonClick({ id }: { id: string }): Promise<void> {
  await updateLatestContext(id, async (context) => {
    await reRender(id, context, {
      acknowledgementScreen: false,
      acknowledged: false,
    });
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
  [MaliciousAcknowledgementFormNames.Review]: onOpenAcknowledgementButtonClick,
  [MaliciousAcknowledgementFormNames.Acknowledge]: onAcknowledgeChange,
  [MaliciousAcknowledgementFormNames.Proceed]: onProceedButtonClick,
  [MaliciousAcknowledgementFormNames.Back]: onBackButtonClick,
};
