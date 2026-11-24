import type { TransactionSecurityProperties } from '@metamask/snap-networks-utils';
import {
  deserialize,
  getTransactionSecurityProperties,
} from '@metamask/snap-networks-utils';
import type { Json } from '@metamask/snaps-sdk';
import { isObject } from '@metamask/utils';

import type { ConfirmTransactionRequestContext } from './types';

/**
 * Returns the security properties of the verdict the dialog showed. Returns
 * `undefined` when there is nothing to report: there is no context, or security
 * alerts were disabled.
 *
 * The scan is reported as it is. A failed refresh keeps the stored verdict, and
 * the dialog may show that verdict as unavailable, so the two can differ.
 *
 * @param context - The confirmation context at the time of the decision, or `null` when the dialog gave none.
 * @returns The security properties, or `undefined`.
 */
export function getSecurityProperties(
  context: ConfirmTransactionRequestContext | null,
): TransactionSecurityProperties | undefined {
  if (!context?.preferences.useSecurityAlerts) {
    return undefined;
  }

  return getTransactionSecurityProperties(context.scan);
}

/**
 * Reads the value that the confirmation dialog resolved with. Any value that
 * is not a result object, such as a dismissed dialog, is a rejection with no
 * context. Only a boolean `true` is a confirmation.
 *
 * The context is trusted to have the shape of a stored confirmation context,
 * because only `resolveResult` writes it. Its shape is not checked, so reading
 * a context with another shape can throw in the code that uses it.
 *
 * @param value - The value the dialog resolved with.
 * @returns The decision, and the context it was made from.
 */
export function parseConfirmTransactionRequestDialogValue(value: unknown): {
  result: boolean;
  context: ConfirmTransactionRequestContext | null;
} {
  if (!isObject(value)) {
    return { result: false, context: null };
  }

  const { result, context } = value as { result?: unknown; context?: unknown };

  const deserializedContext = isObject(context)
    ? (deserialize(context as Json) as ConfirmTransactionRequestContext)
    : null;

  return {
    result: result === true,
    context: deserializedContext,
  };
}
