import type { TransactionSecurityProperties } from '@metamask/snap-networks-utils';
import {
  getTransactionSecurityProperties,
  SECURITY_ALERT_LOADING_RESPONSE,
  TransactionSecurityPropertiesStruct,
} from '@metamask/snap-networks-utils';
import { isObject } from '@metamask/utils';

import type { ConfirmTransactionRequestContext } from './types';

/**
 * Returns the security properties of the verdict the dialog showed. Returns
 * `undefined` when there is nothing to report: there is no context, or security
 * alerts were disabled.
 *
 * A scan that is still running is reported as `Loading`. Otherwise the scan is
 * reported as it is. A failed refresh keeps the stored verdict, and the dialog
 * may show that verdict as unavailable, so the two can differ.
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

  // A scan that is still running has not failed, so report it as in progress
  // rather than as an error.
  const isFetching = context.scanFetchStatus === 'fetching';
  const scan = isFetching ? SECURITY_ALERT_LOADING_RESPONSE : context.scan;

  return getTransactionSecurityProperties(scan);
}

/**
 * Reads the value that the confirmation dialog resolved with. Any value that
 * is not a result object, such as a dismissed dialog, is a rejection. Only a
 * boolean `true` is a confirmation. Security properties of the wrong shape are
 * left out.
 *
 * @param value - The value the dialog resolved with.
 * @returns The decision, and the security properties the user saw when there
 * are any.
 */
export function parseConfirmTransactionRequestDialogValue(value: unknown): {
  confirmed: boolean;
  securityProperties?: TransactionSecurityProperties;
} {
  if (!isObject(value)) {
    return { confirmed: false };
  }

  const { confirmed, securityProperties } = value;

  return {
    confirmed: confirmed === true,
    ...(TransactionSecurityPropertiesStruct.is(securityProperties)
      ? { securityProperties }
      : {}),
  };
}
