import { SecurityAlertResponse } from './types';

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
