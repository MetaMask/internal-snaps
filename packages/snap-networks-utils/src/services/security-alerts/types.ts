import type { SecurityAlertsApiClient } from '../../clients/security-alerts-api/SecurityAlertsApiClient';
import type { TrackErrorFn } from '../../utils/errors';
import type { Logger } from '../../utils/logger/Logger';
import type { AnalyticsService } from '../analytics/AnalyticsService';

/**
 * Scan options recognized by the Security Alerts API scan endpoints.
 *
 * `simulation` requests an on-chain simulation of the transaction (asset
 * diffs); `validation` requests a security verdict.
 */
export const SECURITY_ALERTS_SCAN_OPTIONS = [
  'simulation',
  'validation',
] as const;

export type SecurityAlertsScanOption =
  (typeof SECURITY_ALERTS_SCAN_OPTIONS)[number];

/** Status of a completed security scan. */
export const SecurityAlertsScanStatus = {
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
} as const;

export type SecurityAlertsScanStatus =
  (typeof SecurityAlertsScanStatus)[keyof typeof SecurityAlertsScanStatus];

/**
 * Verdicts emitted by the Security Alerts API validation.
 *
 * Shared by all network snaps so scan results and analytics agree on the
 * verdict vocabulary.
 */
export const SecurityAlertResponse = {
  Benign: 'Benign',
  Warning: 'Warning',
  Malicious: 'Malicious',
  Error: 'Error',
} as const;

export type SecurityAlertResponse =
  (typeof SecurityAlertResponse)[keyof typeof SecurityAlertResponse];

/**
 * Parameters identifying the origin and account a scan belongs to, resolved
 * by the calling snap for scan analytics.
 */
export type BaseScanParams = {
  /** The origin of the scan request. */
  origin: string;
  /** The CAIP-2 chain id of the scanned transaction. */
  scope: string;
  /** Type of the keyring account the scanned transaction belongs to. */
  accountType?: string;
};

/**
 * Minimal shape the analytics methods read from a completed scan result.
 * Chain-specific scan result types must structurally satisfy it.
 */
export type SecurityScanOutcome = {
  status: string;
  validation?: {
    type?: string | null;
    reason?: string | null;
  } | null;
};

/**
 * Options for a {@link BaseTransactionScanService} constructor.
 */
export type BaseTransactionScanServiceOptions = {
  securityAlertsApiClient: SecurityAlertsApiClient;
  analyticsService: AnalyticsService;
  logger: Logger;
  /** Reports unexpected scan failures to Sentry. */
  trackError: TrackErrorFn;
};
