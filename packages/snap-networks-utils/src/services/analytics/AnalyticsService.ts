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

/**
 * Fields shared by every event tied to an account on a chain.
 */
export type AccountEventProperties = {
  origin: string;
  accountType: string;
  chainIdCaip: string;
};

/**
 * Properties of a transaction lifecycle event.
 *
 * `transactionType` is the optional classification of the transaction, using
 * the `@metamask/keyring-api` `TransactionType` vocabulary (`send`, `swap`,
 * `bridge:send`, ...). Together with `origin` it identifies which flow produced
 * the event: `origin` says who initiated it, `transactionType` says what kind of
 * operation it was. It is omitted when the emitting Snap cannot classify the
 * transaction.
 *
 * Security events intentionally do not extend this type: they are not tied to a
 * transaction classification, so advertising `transactionType` there would let
 * callers pass a value that is silently discarded.
 */
export type TransactionEventProperties = AccountEventProperties & {
  transactionType?: string;
};

export type TransactionFinalizedEventProperties = TransactionEventProperties & {
  transactionStatus?: string;
};

export type SecurityAlertDetectedEventProperties = AccountEventProperties & {
  securityAlertResponse: string;
  securityAlertReason: string | null;
  securityAlertDescription: string;
};

export type SecurityScanCompletedEventProperties = AccountEventProperties & {
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
   * @param properties.transactionType - Optional transaction type.
   */
  async trackTransactionAdded({
    origin,
    accountType,
    chainIdCaip,
    transactionType,
  }: TransactionEventProperties): Promise<void> {
    await this.trackEvent(TransactionEventType.TransactionAdded, {
      message: 'Snap transaction added',
      origin,
      account_type: accountType,
      chain_id_caip: chainIdCaip,
      ...(transactionType === undefined
        ? {}
        : { transaction_type: transactionType }),
    });
  }

  /**
   * Track a "Transaction Rejected" event when the user rejects a transaction.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the request.
   * @param properties.accountType - The type of account.
   * @param properties.chainIdCaip - The CAIP-2 chain ID.
   * @param properties.transactionType - Optional transaction type.
   */
  async trackTransactionRejected({
    origin,
    accountType,
    chainIdCaip,
    transactionType,
  }: TransactionEventProperties): Promise<void> {
    await this.trackEvent(TransactionEventType.TransactionRejected, {
      message: 'Snap transaction rejected',
      origin,
      account_type: accountType,
      chain_id_caip: chainIdCaip,
      ...(transactionType === undefined
        ? {}
        : { transaction_type: transactionType }),
    });
  }

  /**
   * Track a "Transaction Approved" event when a transaction is approved.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the request.
   * @param properties.accountType - The type of account.
   * @param properties.chainIdCaip - The CAIP-2 chain ID.
   * @param properties.transactionType - Optional transaction type.
   */
  async trackTransactionApproved({
    origin,
    accountType,
    chainIdCaip,
    transactionType,
  }: TransactionEventProperties): Promise<void> {
    await this.trackEvent(TransactionEventType.TransactionApproved, {
      message: 'Snap transaction approved',
      origin,
      account_type: accountType,
      chain_id_caip: chainIdCaip,
      ...(transactionType === undefined
        ? {}
        : { transaction_type: transactionType }),
    });
  }

  /**
   * Track a "Transaction Submitted" event when a transaction is broadcast.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the request.
   * @param properties.accountType - The type of account.
   * @param properties.chainIdCaip - The CAIP-2 chain ID.
   * @param properties.transactionType - Optional transaction type.
   */
  async trackTransactionSubmitted({
    origin,
    accountType,
    chainIdCaip,
    transactionType,
  }: TransactionEventProperties): Promise<void> {
    await this.trackEvent(TransactionEventType.TransactionSubmitted, {
      message: 'Snap transaction submitted',
      origin,
      account_type: accountType,
      chain_id_caip: chainIdCaip,
      ...(transactionType === undefined
        ? {}
        : { transaction_type: transactionType }),
    });
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
}
