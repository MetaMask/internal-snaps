import type { TransactionSecurityProperties } from '../analytics/AnalyticsService';
import { SecurityAlertResponse } from './types';

/**
 * A security verdict for a transaction, as reported by the snap.
 */
export type SecurityVerdict = {
  /** The verdict, or `Loading` while the scan is in progress. */
  response: SecurityAlertResponse | 'Loading';
  /** The Blockaid reason for the verdict, if any. */
  reason?: string | null;
  /** The Blockaid description of the verdict, if any. */
  description?: string | null;
};

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
 * - With no verdict (for example, security alerts are off), no fields are returned.
 * - `reason` is omitted for `Benign`. Other verdicts report `NotApplicable` when
 *   they have no reason.
 * - `description` is included only when the response has one.
 *
 * @param verdict - The security verdict, or null/undefined when no response is stored.
 * @returns The security properties to add to a transaction event.
 */
export function getTransactionSecurityProperties(
  verdict?: SecurityVerdict | null,
): TransactionSecurityProperties {
  if (!verdict) {
    return {};
  }

  const { response, reason, description } = verdict;

  const isBenign = response === SecurityAlertResponse.Benign;

  return {
    securityAlertResponse: response,
    ...(isBenign ? {} : { securityAlertReason: reason ?? 'NotApplicable' }),
    ...(description ? { securityAlertDescription: description } : {}),
  };
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
