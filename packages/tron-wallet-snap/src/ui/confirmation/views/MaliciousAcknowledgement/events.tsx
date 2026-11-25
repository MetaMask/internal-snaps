import { MaliciousAcknowledgementFormNames } from '@metamask/snap-networks-utils';
import type { InputChangeEvent, UserInputEvent } from '@metamask/snaps-sdk';

import type { SnapClient } from '../../../../clients/snap/SnapClient';
import {
  isTransactionConfirmationBlocked,
  isSignTransactionContext,
} from '../../utils/isTransactionConfirmationBlocked';
import type { TransactionConfirmationContext } from '../../utils/isTransactionConfirmationBlocked';
import { ConfirmSignTransaction } from '../ConfirmSignTransaction/ConfirmSignTransaction';
import { ConfirmTransactionRequest } from '../ConfirmTransactionRequest/ConfirmTransactionRequest';

type EventOptions = { id: string; event: UserInputEvent };
type EventHandler = (options: EventOptions) => Promise<void>;
type AcknowledgementPatch = Partial<
  Pick<TransactionConfirmationContext, 'acknowledgementScreen' | 'acknowledged'>
>;

/**
 * Reads the latest transaction context, excluding closed and message interfaces.
 *
 * @param snapClient - The Snap client.
 * @param id - The interface ID.
 * @returns The current transaction context or null.
 */
async function getContext(
  snapClient: SnapClient,
  id: string,
): Promise<TransactionConfirmationContext | null> {
  const context =
    await snapClient.getInterfaceContext<TransactionConfirmationContext>(id);
  return context &&
    (Object.hasOwn(context, 'transaction') ||
      Object.hasOwn(context, 'transactionRawData'))
    ? context
    : null;
}

/**
 * Re-renders the interface with patched acknowledgement state.
 *
 * @param snapClient - The Snap client.
 * @param id - The interface ID.
 * @param context - The current transaction context.
 * @param patch - The acknowledgement flags to update.
 */
async function reRender(
  snapClient: SnapClient,
  id: string,
  context: TransactionConfirmationContext,
  patch: AcknowledgementPatch,
): Promise<void> {
  const nextContext = { ...context, ...patch };
  const ui = isSignTransactionContext(nextContext) ? (
    <ConfirmSignTransaction context={nextContext} />
  ) : (
    <ConfirmTransactionRequest context={nextContext} />
  );
  await snapClient.updateInterface(id, ui, nextContext);
}

/**
 * Opens acknowledgement when the user clicks the danger Confirm button.
 *
 * @param snapClient - The Snap client.
 * @param options - The user input event options.
 */
async function onReviewClick(
  snapClient: SnapClient,
  options: EventOptions,
): Promise<void> {
  const { id } = options;

  await snapClient.withInterfaceLock(id, async () => {
    const context = await getContext(snapClient, id);
    if (!context) {
      return;
    }

    await reRender(snapClient, id, context, {
      acknowledgementScreen: true,
      acknowledged: false,
    });
  });
}

/**
 * Tracks the risk-acknowledgement checkbox.
 *
 * @param snapClient - The Snap client.
 * @param options - The user input event options.
 */
async function onAcknowledgeChange(
  snapClient: SnapClient,
  options: EventOptions,
): Promise<void> {
  const { id, event } = options;

  await snapClient.withInterfaceLock(id, async () => {
    const context = await getContext(snapClient, id);

    if (!context) {
      return;
    }

    const acknowledged = Boolean((event as InputChangeEvent).value);

    await reRender(snapClient, id, context, {
      acknowledged,
    });
  });
}

/**
 * Confirms acknowledged risk after rechecking blockers from background updates.
 * Returns to confirmation if the transaction has become blocked.
 *
 * @param snapClient - The Snap client.
 * @param options - The user input event options.
 */
async function onProceedClick(
  snapClient: SnapClient,
  options: EventOptions,
): Promise<void> {
  const { id } = options;

  await snapClient.withInterfaceLock(id, async () => {
    const context = await getContext(snapClient, id);
    if (context?.acknowledged !== true) {
      return;
    }

    if (isTransactionConfirmationBlocked(context)) {
      await reRender(snapClient, id, context, {
        acknowledgementScreen: false,
        acknowledged: false,
      });
      return;
    }

    await snapClient.resolveInterface(id, true);
  });
}

/**
 * Returns to confirmation and clears acknowledgement.
 *
 * @param snapClient - The Snap client.
 * @param options - The user input event options.
 */
async function onBackClick(
  snapClient: SnapClient,
  options: EventOptions,
): Promise<void> {
  const { id } = options;

  await snapClient.withInterfaceLock(id, async () => {
    const context = await getContext(snapClient, id);

    if (context?.acknowledgementScreen) {
      await reRender(snapClient, id, context, {
        acknowledgementScreen: false,
        acknowledged: false,
      });
    }
  });
}

/**
 * Creates the acknowledgement handlers shared by both transaction flows.
 *
 * @param snapClient - The Snap client.
 * @returns The handlers keyed by form element name.
 */
export function createEventHandlers(
  snapClient: SnapClient,
): Record<string, EventHandler> {
  return {
    [MaliciousAcknowledgementFormNames.Review]: onReviewClick.bind(
      null,
      snapClient,
    ),
    [MaliciousAcknowledgementFormNames.Acknowledge]: onAcknowledgeChange.bind(
      null,
      snapClient,
    ),
    [MaliciousAcknowledgementFormNames.Proceed]: onProceedClick.bind(
      null,
      snapClient,
    ),
    [MaliciousAcknowledgementFormNames.Back]: onBackClick.bind(
      null,
      snapClient,
    ),
  };
}
