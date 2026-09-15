import type { InputChangeEvent } from '@metamask/snaps-sdk';
import type { Json } from '@metamask/utils';

import type { ConfirmSendJsonRpcRequest } from '../../../../handlers/clientRequest/api';
import {
  ConfirmationContextRefresherKey,
  RefreshConfirmationContextHandler,
} from '../../../../handlers/cronjob/refreshConfirmationContext';
import type {
  UserInputUiEventHandler,
  UserInputUiEventHandlerContext,
} from '../../../../handlers/user-input/api';
import { getMemoDraftValidationError } from '../../../../services/transaction';
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
 * Resolves the memo currently saved on confirmation context.
 *
 * @param context - The interface context.
 * @returns The existing memo string, or empty when none.
 */
function existingMemoFromContext(context: Record<string, Json>): string {
  return typeof context.memo === 'string' ? context.memo : '';
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
    memoDraft: existingMemoFromContext(context),
    memoError: null,
  });
}

/**
 * Tracks the memo draft as the user types.
 *
 * @param options - The user input handler context.
 */
async function onMemoInputChange(
  options: UserInputUiEventHandlerContext,
): Promise<void> {
  const { id, event, context } = options;
  if (!context) {
    return;
  }
  const rawValue = (event as InputChangeEvent).value;
  const value = typeof rawValue === 'string' ? rawValue : '';
  await reRender(id, context, {
    memoDraft: value,
    memoError: getMemoDraftValidationError(value),
  });
}

/**
 * Saves the memo onto confirmation context and restarts validation + scan when
 * a live refresh pipeline is present.
 *
 * @param options - The user input handler context.
 */
async function onSaveClick(
  options: UserInputUiEventHandlerContext,
): Promise<void> {
  const { id, context } = options;
  if (!context || context.memoError) {
    return;
  }

  const draft =
    typeof context.memoDraft === 'string' ? context.memoDraft.trim() : '';
  const draftError = getMemoDraftValidationError(draft);
  if (draftError) {
    await reRender(id, context, {
      memoError: draftError,
    });
    return;
  }

  const nextMemo = draft.length > 0 ? draft : '';

  const nextContext = {
    ...context,
    memo: nextMemo,
    memoScreen: false,
    memoDraft: nextMemo,
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
  // context for display, without fighting a halted cron.
  const canRestartRefresh =
    typeof context.transaction === 'string' &&
    typeof context.accountId === 'string' &&
    context.transactionsFetchStatus !== undefined;

  const refreshedContext = canRestartRefresh
    ? {
        ...nextContext,
        transactionsFetchStatus: FetchStatus.Fetching,
        scanFetchStatus: FetchStatus.Fetching,
      }
    : nextContext;

  await updateInterfaceIfExists(
    id,
    renderConfirmationView(interfaceKey, refreshedContext),
    refreshedContext,
  );

  const { scope } = context;
  if (canRestartRefresh && typeof scope === 'string') {
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
    );
  }
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
    [MemoEditFormNames.Input]: onMemoInputChange,
    [MemoEditFormNames.Save]: onSaveClick,
    [MemoEditFormNames.Back]: onBackClick,
  };
}
