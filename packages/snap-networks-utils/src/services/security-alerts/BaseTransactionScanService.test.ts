import type { SecurityAlertsApiClient } from '../../clients/security-alerts-api/SecurityAlertsApiClient';
import type { Logger } from '../../utils/logger/Logger';
import type { AnalyticsService } from '../analytics/AnalyticsService';
import { BaseTransactionScanService } from './BaseTransactionScanService';
import type { BaseScanParams, SecurityScanOutcome } from './types';
import { SecurityAlertsScanStatus } from './types';

class FakeScanService extends BaseTransactionScanService {
  public async scanTransaction(): Promise<SecurityScanOutcome | null> {
    return { status: 'SUCCESS', validation: { type: 'Benign', reason: null } };
  }

  public callTrackCompleted(
    params: BaseScanParams,
    scan: SecurityScanOutcome,
  ): Promise<void> {
    return this.trackScanCompleted(params, scan);
  }

  public callTrackFailed(params: BaseScanParams): Promise<void> {
    return this.trackScanFailed(params);
  }

  public getLogger(): Logger {
    return this.logger;
  }

  public getTrackError(): unknown {
    return this.trackError;
  }

  public getSecurityAlertsApiClient(): SecurityAlertsApiClient {
    return this.securityAlertsApiClient;
  }

  public getAnalyticsService(): AnalyticsService {
    return this.analyticsService;
  }
}

describe('BaseTransactionScanService', () => {
  const params: BaseScanParams = {
    origin: 'https://example.com',
    scope: 'solana:mainnet',
    accountType: 'ledger',
  };

  const benignScan: SecurityScanOutcome = {
    status: 'SUCCESS',
    validation: { type: 'Benign', reason: null },
  };

  function setup(): {
    service: FakeScanService;
    securityAlertsApiClient: SecurityAlertsApiClient;
    analyticsService: AnalyticsService;
    logger: Logger;
    trackError: jest.Mock;
  } {
    const securityAlertsApiClient = {
      scanTransaction: jest.fn(),
    } as unknown as SecurityAlertsApiClient;
    const analyticsService = {
      trackSecurityScanCompleted: jest.fn(),
      trackSecurityAlertDetected: jest.fn(),
    } as unknown as AnalyticsService;
    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;
    const trackError = jest.fn();
    const service = new FakeScanService({
      securityAlertsApiClient,
      analyticsService,
      logger,
      trackError,
    });

    return {
      service,
      securityAlertsApiClient,
      analyticsService,
      logger,
      trackError,
    };
  }

  it('exposes the shared scan dependencies to subclasses', () => {
    const {
      service,
      securityAlertsApiClient,
      analyticsService,
      logger,
      trackError,
    } = setup();

    expect(service.getSecurityAlertsApiClient()).toBe(securityAlertsApiClient);
    expect(service.getAnalyticsService()).toBe(analyticsService);
    expect(service.getLogger()).toBe(logger);
    expect(service.getTrackError()).toBe(trackError);
  });

  describe('trackScanCompleted', () => {
    it('tracks a completed scan without alerts for benign scans', async () => {
      const { service, analyticsService } = setup();

      await service.callTrackCompleted(params, benignScan);

      expect(analyticsService.trackSecurityScanCompleted).toHaveBeenCalledWith({
        origin: params.origin,
        accountType: params.accountType,
        chainIdCaip: params.scope,
        scanStatus: 'SUCCESS',
        hasSecurityAlerts: false,
      });
      expect(
        analyticsService.trackSecurityAlertDetected,
      ).not.toHaveBeenCalled();
    });

    it('tracks an alert-detected event for a reportable verdict', async () => {
      const { service, analyticsService } = setup();

      await service.callTrackCompleted(params, {
        status: 'SUCCESS',
        validation: { type: 'Warning', reason: 'known_attacker' },
      });

      expect(analyticsService.trackSecurityScanCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ hasSecurityAlerts: true }),
      );
      expect(analyticsService.trackSecurityAlertDetected).toHaveBeenCalledWith({
        origin: params.origin,
        accountType: params.accountType,
        chainIdCaip: params.scope,
        securityAlertResponse: 'Warning',
        securityAlertReason: 'known_attacker',
        securityAlertDescription:
          "Security alert: A known attacker's account is involved in the transaction",
      });
    });

    it('echoes the raw reason for unknown reasons', async () => {
      const { service, analyticsService } = setup();

      await service.callTrackCompleted(params, {
        status: 'SUCCESS',
        validation: { type: 'Malicious', reason: 'mystery_reason' },
      });

      expect(analyticsService.trackSecurityAlertDetected).toHaveBeenCalledWith(
        expect.objectContaining({
          securityAlertDescription: 'Security alert: mystery_reason',
        }),
      );
    });

    it('reports a null reason when a reportable verdict has no reason', async () => {
      const { service, analyticsService } = setup();

      await service.callTrackCompleted(params, {
        status: 'SUCCESS',
        validation: { type: 'Malicious' },
      });

      expect(analyticsService.trackSecurityAlertDetected).toHaveBeenCalledWith(
        expect.objectContaining({
          securityAlertReason: null,
          securityAlertDescription: 'Security alert: Unknown reason',
        }),
      );
    });

    it('does not report an alert for an error verdict', async () => {
      const { service, analyticsService } = setup();

      await service.callTrackCompleted(params, {
        status: 'ERROR',
        validation: { type: 'Error', reason: null },
      });

      expect(analyticsService.trackSecurityScanCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ hasSecurityAlerts: false }),
      );
      expect(
        analyticsService.trackSecurityAlertDetected,
      ).not.toHaveBeenCalled();
    });

    it('tracks a completed scan without alerts when validation is missing', async () => {
      const { service, analyticsService } = setup();

      await service.callTrackCompleted(params, { status: 'SUCCESS' });

      expect(analyticsService.trackSecurityScanCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ hasSecurityAlerts: false }),
      );
      expect(
        analyticsService.trackSecurityAlertDetected,
      ).not.toHaveBeenCalled();
    });

    it('does not track analytics without an account type', async () => {
      const { service, analyticsService } = setup();

      await service.callTrackCompleted(
        { ...params, accountType: undefined },
        benignScan,
      );

      expect(
        analyticsService.trackSecurityScanCompleted,
      ).not.toHaveBeenCalled();
      expect(
        analyticsService.trackSecurityAlertDetected,
      ).not.toHaveBeenCalled();
    });
  });

  describe('trackScanFailed', () => {
    it('tracks a completed scan with an error status', async () => {
      const { service, analyticsService } = setup();

      await service.callTrackFailed(params);

      expect(analyticsService.trackSecurityScanCompleted).toHaveBeenCalledWith({
        origin: params.origin,
        accountType: params.accountType,
        chainIdCaip: params.scope,
        scanStatus: SecurityAlertsScanStatus.ERROR,
        hasSecurityAlerts: false,
      });
    });

    it('does not track analytics without an account type', async () => {
      const { service, analyticsService } = setup();

      await service.callTrackFailed({ ...params, accountType: undefined });

      expect(
        analyticsService.trackSecurityScanCompleted,
      ).not.toHaveBeenCalled();
    });
  });
});
