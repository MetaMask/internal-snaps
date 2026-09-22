import { mockLogger } from '../../utils/logger/__mocks__/Logger';
import {
  AnalyticsService,
  SecurityEventType,
  TransactionEventType,
} from './AnalyticsService';
import type { TrackEventCapableProvider } from './AnalyticsService';

describe('AnalyticsService', () => {
  const request = jest.fn();
  const provider = { request } as TrackEventCapableProvider;
  const trackError = jest.fn();
  const analytics = new AnalyticsService({
    getSnapProvider: (): TrackEventCapableProvider => provider,
    logger: mockLogger,
    trackError,
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it.each([
    [
      'trackTransactionAdded',
      TransactionEventType.TransactionAdded,
      'Snap transaction added',
    ],
    [
      'trackTransactionRejected',
      TransactionEventType.TransactionRejected,
      'Snap transaction rejected',
    ],
    [
      'trackTransactionApproved',
      TransactionEventType.TransactionApproved,
      'Snap transaction approved',
    ],
    [
      'trackTransactionSubmitted',
      TransactionEventType.TransactionSubmitted,
      'Snap transaction submitted',
    ],
  ] as const)('tracks %s', async (method, event, message) => {
    await analytics[method]({
      origin: 'https://example.com',
      accountType: 'eip155:eoa',
      chainIdCaip: 'eip155:1',
    });

    expect(request).toHaveBeenCalledWith({
      method: 'snap_trackEvent',
      params: {
        event: {
          event,
          properties: {
            message,
            origin: 'https://example.com',
            account_type: 'eip155:eoa',
            chain_id_caip: 'eip155:1',
          },
        },
      },
    });
  });

  it('tracks finalized transactions with optional transaction details', async () => {
    await analytics.trackTransactionFinalized({
      origin: 'https://example.com',
      accountType: 'eip155:eoa',
      chainIdCaip: 'eip155:1',
      transactionStatus: 'confirmed',
      transactionType: 'send',
    });

    expect(request).toHaveBeenCalledWith({
      method: 'snap_trackEvent',
      params: {
        event: {
          event: TransactionEventType.TransactionFinalized,
          properties: {
            message: 'Snap transaction finalized',
            origin: 'https://example.com',
            account_type: 'eip155:eoa',
            chain_id_caip: 'eip155:1',
            transaction_status: 'confirmed',
            transaction_type: 'send',
          },
        },
      },
    });
  });

  it('tracks finalized transactions without optional transaction details', async () => {
    await analytics.trackTransactionFinalized({
      origin: 'https://example.com',
      accountType: 'eip155:eoa',
      chainIdCaip: 'eip155:1',
    });

    const event = request.mock.calls[0]?.[0].params.event;
    expect(event.properties).not.toHaveProperty('transaction_status');
    expect(event.properties).not.toHaveProperty('transaction_type');
  });

  it('tracks detected security alerts', async () => {
    await analytics.trackSecurityAlertDetected({
      origin: 'https://example.com',
      accountType: 'eip155:eoa',
      chainIdCaip: 'eip155:1',
      securityAlertResponse: 'malicious',
      securityAlertReason: null,
      securityAlertDescription: 'Known malicious address',
    });

    expect(request).toHaveBeenCalledWith({
      method: 'snap_trackEvent',
      params: {
        event: {
          event: SecurityEventType.SecurityAlertDetected,
          properties: {
            message: 'Snap security alert detected',
            origin: 'https://example.com',
            account_type: 'eip155:eoa',
            chain_id_caip: 'eip155:1',
            security_alert_response: 'malicious',
            security_alert_reason: null,
            security_alert_description: 'Known malicious address',
          },
        },
      },
    });
  });

  it('tracks completed security scans', async () => {
    await analytics.trackSecurityScanCompleted({
      origin: 'https://example.com',
      accountType: 'eip155:eoa',
      chainIdCaip: 'eip155:1',
      scanStatus: 'success',
      hasSecurityAlerts: false,
    });

    expect(request).toHaveBeenCalledWith({
      method: 'snap_trackEvent',
      params: {
        event: {
          event: SecurityEventType.SecurityScanCompleted,
          properties: {
            message: 'Snap security scan completed',
            origin: 'https://example.com',
            account_type: 'eip155:eoa',
            chain_id_caip: 'eip155:1',
            scan_status: 'success',
            has_security_alerts: false,
          },
        },
      },
    });
  });

  it('tracks WebSocket connection failures', async () => {
    await analytics.trackWebSocketConnectionClosedNotCleanly({
      origin: 'metamask',
      code: 1006,
      reason: null,
    });

    expect(request).toHaveBeenCalledWith({
      method: 'snap_trackEvent',
      params: {
        event: {
          event: 'WebSocket Connection Closed Not Cleanly',
          properties: {
            message: 'Snap WebSocket connection closed not cleanly',
            origin: 'metamask',
            code: 1006,
            reason: null,
          },
        },
      },
    });
  });

  it('tracks arbitrary events', async () => {
    await analytics.trackEvent('Custom Event', { value: 42 });

    expect(request).toHaveBeenCalledWith({
      method: 'snap_trackEvent',
      params: {
        event: {
          event: 'Custom Event',
          properties: { value: 42 },
        },
      },
    });
  });

  it('reports and logs tracking failures without throwing', async () => {
    const error = new Error('Tracking failed');
    request.mockRejectedValueOnce(error);

    expect(
      await analytics.trackEvent('Custom Event', { value: 42 }),
    ).toBeUndefined();

    expect(trackError).toHaveBeenCalledWith(error);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[AnalyticsService]',
      'Failed to track event',
      {
        error,
        event: 'Custom Event',
        properties: { value: 42 },
      },
    );
  });

  it('does not throw when reporting a tracking failure also fails', async () => {
    request.mockRejectedValueOnce(new Error('Tracking failed'));
    trackError.mockRejectedValueOnce(new Error('Error tracking failed'));

    expect(
      await analytics.trackEvent('Custom Event', { value: 42 }),
    ).toBeUndefined();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[AnalyticsService]',
      'Failed to report analytics error',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });
});
