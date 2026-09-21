import type { Json } from '@metamask/snaps-sdk';

import type { TrackErrorFn } from '../../utils/errors';
import type { Logger } from '../../utils/logger/Logger';

export const TransactionEventType = {
  TransactionAdded: 'Transaction Added',
  TransactionRejected: 'Transaction Rejected',
  TransactionApproved: 'Transaction Approved',
  TransactionSubmitted: 'Transaction Submitted',
  TransactionFinalized: 'Transaction Finalized',
} as const;

export type TransactionEventType =
  (typeof TransactionEventType)[keyof typeof TransactionEventType];

export const SecurityEventType = {
  SecurityAlertDetected: 'Security Alert Detected',
  SecurityScanCompleted: 'Security Scan Completed',
} as const;

export type SecurityEventType =
  (typeof SecurityEventType)[keyof typeof SecurityEventType];

export type SnapTrackEventRequest = {
  method: 'snap_trackEvent';
  params: {
    event: {
      event: string;
      properties: Record<string, Json>;
    };
  };
};

export type TrackEventCapableProvider = {
  request: (args: SnapTrackEventRequest) => Promise<unknown>;
};

export type AnalyticsServiceOptions<
  TProvider extends TrackEventCapableProvider = TrackEventCapableProvider,
> = {
  getSnapProvider: () => TProvider;
  logger: Logger;
  trackError: TrackErrorFn;
};

export type TransactionEventProperties = {
  origin: string;
  accountType: string;
  chainIdCaip: string;
};

export type TransactionFinalizedEventProperties = TransactionEventProperties & {
  transactionStatus?: string;
  transactionType?: string;
};

export type SecurityAlertDetectedEventProperties =
  TransactionEventProperties & {
    securityAlertResponse: string;
    securityAlertReason: string | null;
    securityAlertDescription: string;
  };

export type SecurityScanCompletedEventProperties =
  TransactionEventProperties & {
    scanStatus: string;
    hasSecurityAlerts: boolean;
  };

export type WebSocketConnectionClosedEventProperties = {
  origin: string;
  code: number;
  reason: string | null;
};

/**
 * Tracks common network Snap analytics events.
 */
export class AnalyticsService<
  TProvider extends TrackEventCapableProvider = TrackEventCapableProvider,
> {
  readonly #getSnapProvider: () => TProvider;

  readonly #logger: Logger;

  readonly #trackError: TrackErrorFn;

  constructor({
    getSnapProvider,
    logger,
    trackError,
  }: AnalyticsServiceOptions<TProvider>) {
    this.#getSnapProvider = getSnapProvider;
    this.#logger = logger.withPrefix('[AnalyticsService]');
    this.#trackError = trackError;
  }

  /**
   * Track an event in MetaMask analytics.
   *
   * Tracking and error-reporting failures are logged but never interrupt the
   * user flow.
   *
   * @param event - Event name.
   * @param properties - Event properties.
   */
  async trackEvent(
    event: string,
    properties: Record<string, Json>,
  ): Promise<void> {
    try {
      await this.#getSnapProvider().request({
        method: 'snap_trackEvent',
        params: {
          event: {
            event,
            properties,
          },
        },
      });
    } catch (error) {
      try {
        await this.#trackError(error);
      } catch (trackingError) {
        this.#logger.warn('Failed to report analytics error', {
          error: trackingError,
        });
      }

      this.#logger.warn('Failed to track event', {
        error,
        event,
        properties,
      });
    }
  }

  /**
   * Track a "Transaction Added" event when a transaction confirmation is shown.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the request.
   * @param properties.accountType - The type of account.
   * @param properties.chainIdCaip - The CAIP-2 chain ID.
   */
  async trackTransactionAdded(
    properties: TransactionEventProperties,
  ): Promise<void> {
    await this.#trackTransactionEvent(
      TransactionEventType.TransactionAdded,
      'Snap transaction added',
      properties,
    );
  }

  /**
   * Track a "Transaction Rejected" event when the user rejects a transaction.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the request.
   * @param properties.accountType - The type of account.
   * @param properties.chainIdCaip - The CAIP-2 chain ID.
   */
  async trackTransactionRejected(
    properties: TransactionEventProperties,
  ): Promise<void> {
    await this.#trackTransactionEvent(
      TransactionEventType.TransactionRejected,
      'Snap transaction rejected',
      properties,
    );
  }

  /**
   * Track a "Transaction Approved" event when a transaction is approved.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the request.
   * @param properties.accountType - The type of account.
   * @param properties.chainIdCaip - The CAIP-2 chain ID.
   */
  async trackTransactionApproved(
    properties: TransactionEventProperties,
  ): Promise<void> {
    await this.#trackTransactionEvent(
      TransactionEventType.TransactionApproved,
      'Snap transaction approved',
      properties,
    );
  }

  /**
   * Track a "Transaction Submitted" event when a transaction is broadcast.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the request.
   * @param properties.accountType - The type of account.
   * @param properties.chainIdCaip - The CAIP-2 chain ID.
   */
  async trackTransactionSubmitted(
    properties: TransactionEventProperties,
  ): Promise<void> {
    await this.#trackTransactionEvent(
      TransactionEventType.TransactionSubmitted,
      'Snap transaction submitted',
      properties,
    );
  }

  /**
   * Track a "Transaction Finalized" event when a transaction reaches a final state.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the request.
   * @param properties.accountType - The type of account.
   * @param properties.chainIdCaip - The CAIP-2 chain ID.
   * @param properties.transactionStatus - Optional final transaction status.
   * @param properties.transactionType - Optional transaction type.
   */
  async trackTransactionFinalized({
    origin,
    accountType,
    chainIdCaip,
    transactionStatus,
    transactionType,
  }: TransactionFinalizedEventProperties): Promise<void> {
    await this.trackEvent(TransactionEventType.TransactionFinalized, {
      message: 'Snap transaction finalized',
      origin,
      account_type: accountType,
      chain_id_caip: chainIdCaip,
      ...(transactionStatus === undefined
        ? {}
        : { transaction_status: transactionStatus }),
      ...(transactionType === undefined
        ? {}
        : { transaction_type: transactionType }),
    });
  }

  /**
   * Track a "Security Alert Detected" event when a malicious or warning
   * transaction is detected.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the request.
   * @param properties.accountType - The type of account.
   * @param properties.chainIdCaip - The CAIP-2 chain ID.
   * @param properties.securityAlertResponse - The type of security alert.
   * @param properties.securityAlertReason - The reason for the security alert.
   * @param properties.securityAlertDescription - Human-readable description of the alert.
   */
  async trackSecurityAlertDetected({
    origin,
    accountType,
    chainIdCaip,
    securityAlertResponse,
    securityAlertReason,
    securityAlertDescription,
  }: SecurityAlertDetectedEventProperties): Promise<void> {
    await this.trackEvent(SecurityEventType.SecurityAlertDetected, {
      message: 'Snap security alert detected',
      origin,
      account_type: accountType,
      chain_id_caip: chainIdCaip,
      security_alert_response: securityAlertResponse,
      security_alert_reason: securityAlertReason,
      security_alert_description: securityAlertDescription,
    });
  }

  /**
   * Track a "Security Scan Completed" event when a transaction security scan
   * finishes.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the request.
   * @param properties.accountType - The type of account.
   * @param properties.chainIdCaip - The CAIP-2 chain ID.
   * @param properties.scanStatus - The status of the scan.
   * @param properties.hasSecurityAlerts - Whether security alerts were detected.
   */
  async trackSecurityScanCompleted({
    origin,
    accountType,
    chainIdCaip,
    scanStatus,
    hasSecurityAlerts,
  }: SecurityScanCompletedEventProperties): Promise<void> {
    await this.trackEvent(SecurityEventType.SecurityScanCompleted, {
      message: 'Snap security scan completed',
      origin,
      account_type: accountType,
      chain_id_caip: chainIdCaip,
      scan_status: scanStatus,
      has_security_alerts: hasSecurityAlerts,
    });
  }

  /**
   * Track a "WebSocket Connection Closed Not Cleanly" event when a Snap
   * WebSocket disconnects without a clean close.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the connection.
   * @param properties.code - The WebSocket close code.
   * @param properties.reason - The close reason, if any.
   */
  async trackWebSocketConnectionClosedNotCleanly({
    origin,
    code,
    reason,
  }: WebSocketConnectionClosedEventProperties): Promise<void> {
    await this.trackEvent('WebSocket Connection Closed Not Cleanly', {
      message: 'Snap WebSocket connection closed not cleanly',
      origin,
      code,
      reason,
    });
  }

  async #trackTransactionEvent(
    event: TransactionEventType,
    message: string,
    { origin, accountType, chainIdCaip }: TransactionEventProperties,
  ): Promise<void> {
    await this.trackEvent(event, {
      message,
      origin,
      account_type: accountType,
      chain_id_caip: chainIdCaip,
    });
  }
}
