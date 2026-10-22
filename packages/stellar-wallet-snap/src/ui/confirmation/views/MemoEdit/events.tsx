import type { UserInputEvent } from '@metamask/snaps-sdk';
import { FormSubmitEventStruct } from '@metamask/snaps-sdk';
import {
  array,
  assert,
  nonempty,
  optional,
  string,
  type,
} from '@metamask/superstruct';
import type { Json } from '@metamask/utils';

import { KnownCaip2ChainIdStruct } from '../../../../api';
import { getMemoValidationErrorKey } from '../../../../handlers/clientRequest/utils';
import type { ConfirmationDataContext } from '../../../../handlers/cronjob/refreshConfirmationContext';
import {
  ConfirmationContextRefresherKey,
  ConfirmationContextRefresherKeyStruct,
  RefreshConfirmationContextHandler,
} from '../../../../handlers/cronjob/refreshConfirmationContext';
import type {
  UserInputUiEventHandler,
  UserInputUiEventHandlerContext,
} from '../../../../handlers/user-input/api';
import {
  Duration,
  getInterfaceContextIfExists,
  updateInterfaceIfExists,
} from '../../../../utils';
import type { ConfirmationInterfaceKey } from '../../api';
import { ConfirmationInterfaceKeyStruct, FetchStatus } from '../../api';
import { renderConfirmationView } from '../render';
import { MemoEditFormNames } from './constants';

/**
 * Context fields required to save a memo and restart confirmation refresh.
 */
const MemoSaveContextStruct = type({
  scope: KnownCaip2ChainIdStruct,
  interfaceKey: ConfirmationInterfaceKeyStruct,
  backgroundEventId: optional(string()),
  enabledRefresherKeys: nonempty(array(ConfirmationContextRefresherKeyStruct)),
});

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
    memoDraft: null,
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
 * Saves the memo onto confirmation context and restarts the open-time
 * preference-enabled refreshers so clearing a required memo cannot leave
 * Confirm enabled on a stale success.
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
    // Keep the submitted text in `memoDraft` so the input is not reset, without
    // committing it as the saved memo (Back must not persist drafts).
    await reRender(id, context, {
      memoDraft: memo,
      memoError: memoValidationError,
    });
    return;
  }

  // Prefer the latest interface snapshot — click-time `context` can lag a
  // prices/scan write between Open and Save.
  const interfaceContext =
    await getInterfaceContextIfExists<ConfirmationDataContext>(id);
  const baseContext = interfaceContext ?? context;

  try {
    assert(baseContext, MemoSaveContextStruct);

    const { scope, interfaceKey, backgroundEventId, enabledRefresherKeys } =
      baseContext;

    // Only reset slices that were preference-enabled at open.
    const nextContext: Record<string, Json> = {
      ...baseContext,
      memo,
      memoDraft: null,
      memoScreen: false,
      memoError: null,
      // Clear any prior banner; the restarted transaction refresher will set a
      // new error (e.g. RequiresMemo again) or leave it cleared on success.
      errorMessage: null,
    };
    if (
      enabledRefresherKeys.includes(ConfirmationContextRefresherKey.Transaction)
    ) {
      nextContext.transactionsFetchStatus = FetchStatus.Fetched;
    }
    if (enabledRefresherKeys.includes(ConfirmationContextRefresherKey.Scan)) {
      nextContext.scanFetchStatus = FetchStatus.Fetching;
    }

    const nextBackgroundEventId =
      await RefreshConfirmationContextHandler.scheduleBackgroundEvent(
        {
          scope,
          interfaceId: id,
          interfaceKey,
          refresherKeys: enabledRefresherKeys,
        },
        Duration.OneSecond,
        { replaceEventId: backgroundEventId },
      );

    const contextWithEventId = {
      ...nextContext,
      backgroundEventId: nextBackgroundEventId,
    };
    await updateInterfaceIfExists(
      id,
      renderConfirmationView(interfaceKey, contextWithEventId),
      contextWithEventId,
    );
  } catch {
    await reRender(id, context, {
      memoScreen: true,
      memoDraft: memo,
      memoError: 'confirmation.memo.error.saveFailed',
    });
  }
}

/**
 * Returns from the memo edit screen to the confirmation view without
 * committing any in-progress draft.
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
    memoDraft: null,
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
