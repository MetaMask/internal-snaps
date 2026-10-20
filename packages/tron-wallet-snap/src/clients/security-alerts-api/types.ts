/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Metadata identifying the initiator of a scan request, in the wire format
 * of the Tron Security Alerts API scan endpoint.
 */
export type SecurityAlertsMetadata = { domain: string } | { non_dapp: true };

export type SecurityScanPayload = {
  from: string;
  to?: string;
  data?: string;
  value: string;
};
