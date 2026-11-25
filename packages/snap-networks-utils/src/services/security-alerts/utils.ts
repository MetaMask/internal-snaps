import type { Infer } from '@metamask/superstruct';
import { enums, is, object, optional, string } from '@metamask/superstruct';

import { SecurityAlertResponse } from './types';
import type { SecurityAlertsScanOption, SecurityScanOutcome } from './types';

/**
 * The security response reported while a security scan is in progress.
 */
export const SECURITY_ALERT_LOADING_RESPONSE = 'Loading' as const;

/**
 * The security reason reported while a security scan is in progress.
 */
const SECURITY_ALERT_IN_PROGRESS_REASON = 'validation_in_progress' as const;

/**
 * The security reason reported when a response has no reason of its own.
 */
export const SECURITY_ALERT_NOT_APPLICABLE_REASON = 'NotApplicable' as const;

/**
 * The security reason reported when a security scan failed.
 */
const SECURITY_ALERT_ERROR_REASON = 'Error' as const;

/**
 * The verdicts a security scan can return. Any other value is not a verdict.
 */
const SecurityScanVerdictStruct = enums(Object.values(SecurityAlertResponse));

/**
 * Security verdict values reported on transaction events. `Loading` is set
 * while the scan is in progress, and `NotApplicable` stands in for a missing
 * reason.
 */
const TransactionSecurityAlertResponseStruct = enums([
  ...Object.values(SecurityAlertResponse),
  SECURITY_ALERT_LOADING_RESPONSE,
  SECURITY_ALERT_NOT_APPLICABLE_REASON,
]);

export type TransactionSecurityAlertResponse = Infer<
  typeof TransactionSecurityAlertResponseStruct
>;

/**
 * Security verdict fields on transaction lifecycle events, aligned with the
 * MetaMask extension. A field is omitted when there is nothing to report.
 */
export const TransactionSecurityPropertiesStruct = object({
  securityAlertResponse: optional(TransactionSecurityAlertResponseStruct),
  securityAlertReason: optional(string()),
  securityAlertDescription: optional(string()),
});

export type TransactionSecurityProperties = Infer<
  typeof TransactionSecurityPropertiesStruct
>;

/**
 * Human-readable description suffixes for Blockaid validation reasons, shared
 * by all network snaps so analytics descriptions agree across chains.
 *
 * Reasons missing from this table fall back to the raw reason.
 *
 * Reference: https://docs.blockaid.io/reference/response-reference
 */
const SECURITY_ALERT_REASON_DESCRIPTIONS: Record<string, string> = {
  unfair_trade:
    "Unfair trade of assets, without adequate compensation to the owner's account",
  transfer_farming:
    "Substantial transfer of the account's assets to untrusted entities",
  writable_accounts_farming:
    'Transaction exposes unused writable account, can be utilized in BIT-FLIP attacks patterns',
  native_ownership_change:
    'The account transferred ownership of its native SOL to untrusted entities',
  spl_token_ownership_change:
    'The account transferred ownership of its SPL tokens to untrusted entities',
  exposure_farming:
    'The account delegates ownership, thereby exposing its assets to untrusted spenders',
  known_attacker: "A known attacker's account is involved in the transaction",
  invalid_signature:
    'One of the transactions provided contains non valid signatures, that can lead misleading simulation results',
  honeypot:
    'The account invests funds in a token that is part of an orchestrated honeypot scheme',
  other:
    'The transaction was marked as malicious for other reason, further details would be described in features field',
};

/**
 * Resolves the human-readable description of a security alert reason.
 *
 * @param reason - The Blockaid validation reason, if any.
 * @returns A human-readable description of the alert.
 */
export function getSecurityAlertDescription(reason?: string | null): string {
  const suffix =
    SECURITY_ALERT_REASON_DESCRIPTIONS[reason ?? ''] ??
    reason ??
    'Unknown reason';

  return `Security alert: ${suffix}`;
}

/**
 * Resolves the analytics-reportable alert for a validation verdict.
 *
 * A verdict is reportable when the validation produced a real classification:
 * not missing, not benign, and not an error (which means no verdict).
 *
 * @param type - The validation verdict, if any.
 * @returns The reportable alert type, or null when there is nothing to report.
 */
export function deriveSecurityAlert(type?: string | null): string | null {
  return type &&
    type !== SecurityAlertResponse.Benign &&
    type !== SecurityAlertResponse.Error
    ? type
    : null;
}

/**
 * Builds the security fields for a transaction lifecycle event, aligned with
 * the MetaMask extension.
 *
 * - `'Loading'` while the scan is in progress, with reason `validation_in_progress`.
 * - `null` when the scan request failed, which is reported as `Error` with reason `Error`.
 * - A scan without a known verdict, including a successful one with an
 *   unrecognized verdict, is reported as `Error` with reason `Error`, and its
 *   error message as the description when it has one.
 * - Otherwise, the scan's verdict, with its reason and description.
 *
 * `reason` is omitted for `Benign`. Other verdicts report `NotApplicable` when
 * they have no reason. `description` is included only when the scan has one.
 *
 * The same rule applies to every snap: a scan without a known verdict is an
 * error. A caller with a skipped scan should report no security fields instead
 * of passing the scan here.
 *
 * @param scan - The security state to report: the scan outcome, `'Loading'` while the scan is in progress, or `null` when the scan request failed.
 * @returns The security properties to add to a transaction event.
 */
export function getTransactionSecurityProperties(
  scan: SecurityScanOutcome | typeof SECURITY_ALERT_LOADING_RESPONSE | null,
): TransactionSecurityProperties {
  if (scan === SECURITY_ALERT_LOADING_RESPONSE) {
    return {
      securityAlertResponse: SECURITY_ALERT_LOADING_RESPONSE,
      securityAlertReason: SECURITY_ALERT_IN_PROGRESS_REASON,
    };
  }

  const verdict = scan?.validation?.type;

  if (!is(verdict, SecurityScanVerdictStruct)) {
    const description = scan?.error?.message;

    return {
      securityAlertResponse: SecurityAlertResponse.Error,
      securityAlertReason: SECURITY_ALERT_ERROR_REASON,
      ...(description ? { securityAlertDescription: description } : {}),
    };
  }

  const reason =
    scan?.validation?.reason ?? SECURITY_ALERT_NOT_APPLICABLE_REASON;
  const description = scan?.validation?.description;
  const isBenign = verdict === SecurityAlertResponse.Benign;

  return {
    securityAlertResponse: verdict,
    ...(isBenign ? {} : { securityAlertReason: reason }),
    ...(description ? { securityAlertDescription: description } : {}),
  };
}

/**
 * Returns the Security Alerts scan options that the user's preferences enable.
 * Missing preferences are treated as disabled.
 *
 * @param preferences - The preferences that control which scans run.
 * @param preferences.simulateOnChainActions - Whether on-chain simulation is enabled.
 * @param preferences.useSecurityAlerts - Whether security validation is enabled.
 * @returns `simulation` and/or `validation`, in that order.
 */
export function getScanOptions({
  simulateOnChainActions,
  useSecurityAlerts,
}: {
  simulateOnChainActions?: boolean | null;
  useSecurityAlerts?: boolean | null;
}): SecurityAlertsScanOption[] {
  const options: SecurityAlertsScanOption[] = [];

  if (simulateOnChainActions) {
    options.push('simulation');
  }

  if (useSecurityAlerts) {
    options.push('validation');
  }

  return options;
}

/**
 * Determines whether a security alert verdict requires explicit risk
 * acknowledgement before confirming a transaction.
 *
 * Only `SecurityAlertResponse.Malicious` requires acknowledgement when
 * security alerts are enabled. Missing preferences are treated as disabled.
 *
 * @param useSecurityAlerts - Whether security alerts are enabled.
 * @param alert - The security alert verdict, or null/undefined when unavailable.
 * @returns Whether the user must acknowledge the risk before confirming.
 */
export function requiresMaliciousAcknowledgement(
  useSecurityAlerts?: boolean | null,
  alert?: SecurityAlertResponse | null,
): boolean {
  return (
    useSecurityAlerts === true && alert === SecurityAlertResponse.Malicious
  );
}
