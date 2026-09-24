import { FormSubmitEventStruct } from '@metamask/snaps-sdk';
import type { UserInputEvent } from '@metamask/snaps-sdk';
import type { Json } from '@metamask/utils';

import type { ConfirmSendJsonRpcRequest } from '../../../../handlers/clientRequest/api';
import { getMemoValidationErrorKey } from '../../../../handlers/clientRequest/utils';
import {
  ConfirmationContextRefresherKey,
  RefreshConfirmationContextHandler,
} from '../../../../handlers/cronjob/refreshConfirmationContext';
import type {
  UserInputUiEventHandler,
  UserInputUiEventHandlerContext,
} from '../../../../handlers/user-input/api';
import { Duration, updateInterfaceIfExists } from '../../../../utils';
import type { ConfirmationInterfaceKey } from '../../api';
import { FetchStatus } from '../../api';
import { renderConfirmationView } from '../render';
import { MemoEditFormNames } from './constants';

/**
 * Re-renders the interface with a patched context.
 *
 * @param id - The interface id.
 * @param context - The current interface context.
 * @param patch - The context fields to override.
 */
async function reRender(
  id: string,
  context: Record<string, Json>,
  patch: Record<string, Json>,
): Promise<void> {
  const nextContext = { ...context, ...patch };
  const interfaceKey = context.interfaceKey as ConfirmationInterfaceKey;
  await updateInterfaceIfExists(
    id,
    renderConfirmationView(interfaceKey, nextContext),
    nextContext,
  );
}

/**
 * Opens the memo edit screen from send confirmation.
 *
 * @param options - The user input handler context.
 */
async function onOpenClick(
  options: UserInputUiEventHandlerContext,
): Promise<void> {
  const { id, context } = options;
  if (!context) {
    return;
  }
  await reRender(id, context, {
    memoScreen: true,
    memoError: null,
  });
}

/**
 * Reads the memo field from a form submit event.
 *
 * @param event - The form submit event.
 * @returns Trimmed memo string, or empty when absent.
 */
function memoFromSubmitEvent(event: UserInputEvent): string {
  if (!FormSubmitEventStruct.is(event)) {
    return '';
  }

  const value = event.value[MemoEditFormNames.Input];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Saves the memo onto confirmation context and restarts validation + scan when
 * a live refresh pipeline is present.
 *
 * @param options - The user input handler context.
 */
async function onSaveSubmit(
  options: UserInputUiEventHandlerContext,
): Promise<void> {
  const { id, event, context } = options;
  if (!context) {
    return;
  }

  const memo = memoFromSubmitEvent(event);
  const memoValidationError = getMemoValidationErrorKey(memo);
  if (memoValidationError) {
    // Keep the submitted text in `memo` so the input is not reset when we
    // re-render with the validation error.
    await reRender(id, context, {
      memo,
      memoError: memoValidationError,
    });
    return;
  }

  const nextContext = {
    ...context,
    memo,
    memoScreen: false,
    memoError: null,
  };

  const { interfaceKey } = context as {
    interfaceKey?: ConfirmationInterfaceKey;
  };
  if (!interfaceKey) {
    return;
  }

  // Only restart validation/scan when this confirmation actually has a live
  // refresh pipeline. Hard pre-submit error dialogs have `request` but no
  // `transaction` / localSimulation — still allow saving the memo onto
  // context for display, without fighting a paused cron.
  const canRestartRefresh =
    typeof context.transaction === 'string' &&
    typeof context.accountId === 'string' &&
    context.transactionsFetchStatus !== undefined;

  const refreshedContext = canRestartRefresh
    ? {
        ...nextContext,
        transactionsFetchStatus: FetchStatus.Fetched,
        scanFetchStatus: FetchStatus.Fetching,
      }
    : nextContext;

  const { scope } = context;
  if (canRestartRefresh && typeof scope === 'string') {
    const previousEventId =
      typeof context.backgroundEventId === 'string'
        ? context.backgroundEventId
        : undefined;
    // Cancel any pending open/prices cron first, then schedule Transaction+Scan
    // restart (bitcoin-style replace — avoids stacked refresh chains).
    const backgroundEventId =
      await RefreshConfirmationContextHandler.scheduleBackgroundEvent(
        {
          scope: scope as ConfirmSendJsonRpcRequest['params']['scope'],
          interfaceId: id,
          interfaceKey,
          refresherKeys: [
            ConfirmationContextRefresherKey.Transaction,
            ConfirmationContextRefresherKey.Scan,
            ConfirmationContextRefresherKey.Prices,
          ],
        },
        Duration.OneSecond,
        { replaceEventId: previousEventId },
      );
    const contextWithEventId = { ...refreshedContext, backgroundEventId };
    await updateInterfaceIfExists(
      id,
      renderConfirmationView(interfaceKey, contextWithEventId),
      contextWithEventId,
    );
    return;
  }

  await updateInterfaceIfExists(
    id,
    renderConfirmationView(interfaceKey, refreshedContext),
    refreshedContext,
  );
}

/**
 * Returns from the memo edit screen to the confirmation view.
 *
 * @param options - The user input handler context.
 */
async function onBackClick(
  options: UserInputUiEventHandlerContext,
): Promise<void> {
  const { id, context } = options;
  if (!context) {
    return;
  }
  await reRender(id, context, {
    memoScreen: false,
    memoError: null,
  });
}

/**
 * Create memo-edit event handlers for send confirmation.
 *
 * @returns Object containing event handlers keyed by form element name.
 */
export function createEventHandlers(): Record<string, UserInputUiEventHandler> {
  return {
    [MemoEditFormNames.Open]: onOpenClick,
    [MemoEditFormNames.Form]: onSaveSubmit,
    [MemoEditFormNames.Back]: onBackClick,
  };
}
