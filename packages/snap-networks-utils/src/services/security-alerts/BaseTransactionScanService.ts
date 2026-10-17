import type { SecurityAlertsApiClient } from '../../clients/security-alerts-api/SecurityAlertsApiClient';
import type { TrackErrorFn } from '../../utils/errors';
import type { Logger } from '../../utils/logger/Logger';
import type { AnalyticsService } from '../analytics/AnalyticsService';
import type {
  BaseScanParams,
  BaseTransactionScanServiceOptions,
  SecurityScanOutcome,
} from './types';
import { SecurityAlertsScanStatus } from './types';
import { deriveSecurityAlert, getSecurityAlertDescription } from './utils';

/**
 * Base for the network snaps' transaction scan services.
 *
 * Owns the shared scan dependencies (Security Alerts API client, analytics,
 * logger, error reporting) and the scan analytics orchestration. Each snap
 * implements its own {@link scanTransaction} flow — request body, schema
 * assertions, and response mapping are chain-specific — and calls the
 * protected analytics methods as the scan completes or fails.
 */
export abstract class BaseTransactionScanService {
  protected readonly securityAlertsApiClient: SecurityAlertsApiClient;

  protected readonly analyticsService: AnalyticsService;

  protected readonly logger: Logger;

  protected readonly trackError: TrackErrorFn;

  /**
   * Creates a new base transaction scan service.
   *
   * @param options - The service options.
   * @param options.securityAlertsApiClient - The shared scan API client.
   * @param options.analyticsService - The shared analytics service.
   * @param options.logger - The logger to use.
   * @param options.trackError - Reports scan failures to Sentry.
   */
  constructor({
    securityAlertsApiClient,
    analyticsService,
    logger,
    trackError,
  }: BaseTransactionScanServiceOptions) {
    this.securityAlertsApiClient = securityAlertsApiClient;
    this.analyticsService = analyticsService;
    this.logger = logger;
    this.trackError = trackError;
  }

  /**
   * The single scan entry point every network snap implements.
   *
   * Parameters are chain-specific and intentionally unconstrained here;
   * implementations resolve to the mapped scan result, or `null` when the
   * scan could not be performed. Analytics reporting is the implementation's
   * responsibility, via {@link trackScanCompleted} / {@link trackScanFailed}.
   *
   * @param params - The chain-specific scan parameters.
   * @returns The mapped scan result, or `null` when the scan failed.
   */
  abstract scanTransaction(
    params: unknown,
  ): Promise<SecurityScanOutcome | null>;

  /**
   * Tracks the analytics events of a completed scan: always a completed scan
   * event, plus an alert-detected event when the verdict is reportable.
   *
   * Analytics are only tracked when the scan params carry an account type.
   *
   * @param params - The origin and account the scan belongs to.
   * @param scan - The mapped scan result.
   */
  protected async trackScanCompleted(
    params: BaseScanParams,
    scan: SecurityScanOutcome,
  ): Promise<void> {
    const { origin, accountType, scope } = params;

    if (!accountType) {
      return;
    }

    const securityAlert = deriveSecurityAlert(scan.validation?.type);

    await this.analyticsService.trackSecurityScanCompleted({
      origin,
      accountType,
      chainIdCaip: scope,
      scanStatus: scan.status,
      hasSecurityAlerts: Boolean(securityAlert),
    });

    if (!securityAlert) {
      return;
    }

    const reason = scan.validation?.reason ?? null;

    await this.analyticsService.trackSecurityAlertDetected({
      origin,
      accountType,
      chainIdCaip: scope,
      securityAlertResponse: securityAlert,
      securityAlertReason: reason,
      securityAlertDescription: getSecurityAlertDescription(reason),
    });
  }

  /**
   * Tracks the analytics events of a failed scan: a completed scan event with
   * an error status, when the scan is tied to an account.
   *
   * @param params - The origin and account the scan belongs to.
   */
  protected async trackScanFailed(params: BaseScanParams): Promise<void> {
    const { origin, accountType, scope } = params;

    if (!accountType) {
      return;
    }

    await this.analyticsService.trackSecurityScanCompleted({
      origin,
      accountType,
      chainIdCaip: scope,
      scanStatus: SecurityAlertsScanStatus.ERROR,
      hasSecurityAlerts: false,
    });
  }
}
