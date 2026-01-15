/* eslint-disable @typescript-eslint/naming-convention */
import type { JsonSLIP10Node } from '@metamask/key-tree';
import type { EntropySourceId } from '@metamask/keyring-api';
import type {
  DialogResult,
  EntropySource,
  GetClientStatusResult,
  GetInterfaceStateResult,
  Json,
  ResolveInterfaceResult,
  UpdateInterfaceResult,
} from '@metamask/snaps-sdk';

import { SecurityEventType, TransactionEventType } from '../../types/analytics';
import type { Preferences } from '../../types/snap';

/**
 * Client for interacting with the Snap API.
 * Provides methods for managing interfaces, dialogs, preferences, and background events.
 */
export class SnapClient {
  /**
   * Retrieves a `SLIP10NodeInterface` object for the specified path and curve.
   *
   * @param params - The parameters for the Solana key derivation.
   * @param params.entropySource - The entropy source to use for key derivation.
   * @param params.path - The BIP32 derivation path for which to retrieve a `SLIP10NodeInterface`.
   * @param params.curve - The elliptic curve to use for key derivation.
   * @returns A Promise that resolves to a `SLIP10NodeInterface` object.
   */
  async getBip32Entropy({
    entropySource,
    path,
    curve,
  }: {
    entropySource?: EntropySourceId | undefined;
    path: string[];
    curve: 'secp256k1' | 'ed25519';
  }): Promise<JsonSLIP10Node> {
    return snap.request({
      method: 'snap_getBip32Entropy',
      params: {
        path,
        curve,
        ...(entropySource ? { source: entropySource } : {}),
      },
    });
  }

  /**
   * Create a UI interface with the provided UI component and context.
   *
   * @param ui - The UI component to render.
   * @param context - The initial context object to associate with the interface.
   * @returns The created interface id.
   */
  async createInterface<TContext>(
    ui: any,
    context: TContext & Record<string, Json>,
  ): Promise<string> {
    return snap.request({
      method: 'snap_createInterface',
      params: {
        ui,
        context,
      },
    });
  }

  /**
   * Update an existing UI interface with a new UI component and context.
   *
   * @param id - The interface id returned from createInterface.
   * @param ui - The new UI component to render.
   * @param context - The updated context object to associate with the interface.
   * @returns The update interface result.
   */
  async updateInterface<TContext>(
    id: string,
    ui: any,
    context: TContext & Record<string, Json>,
  ): Promise<UpdateInterfaceResult> {
    return snap.request({
      method: 'snap_updateInterface',
      params: {
        id,
        ui,
        context,
      },
    });
  }

  /**
   * Gets the state of an interactive interface by its ID.
   *
   * @param id - The ID for the interface to update.
   * @returns An object containing the state of the interface.
   */
  async getInterfaceState(id: string): Promise<GetInterfaceStateResult> {
    return snap.request({
      method: 'snap_getInterfaceState',
      params: {
        id,
      },
    });
  }

  /**
   * Gets the context of an interface by its ID.
   *
   * @param id - The ID for the interface.
   * @returns The context object associated with the interface, or null if not found.
   */
  async getInterfaceContext<TContext extends Json>(
    id: string,
  ): Promise<TContext | null> {
    const rawContext = await snap.request({
      method: 'snap_getInterfaceContext',
      params: {
        id,
      },
    });

    if (!rawContext) {
      return null;
    }

    return rawContext as TContext;
  }

  /**
   * Updates the context of an interface by its ID without changing the UI.
   * Note: This is a helper that re-uses the existing UI.
   *
   * @param id - The ID for the interface.
   * @param ui - The UI component.
   * @param context - The updated context object.
   * @returns The update interface result.
   */
  async updateInterfaceWithContext<TContext extends Record<string, Json>>(
    id: string,
    ui: any,
    context: TContext,
  ): Promise<UpdateInterfaceResult> {
    return snap.request({
      method: 'snap_updateInterface',
      params: {
        id,
        ui,
        context,
      },
    });
  }

  /**
   * Resolve a dialog using the provided ID.
   *
   * @param id - The ID for the interface to update.
   * @param value - The result to resolve the interface with.
   * @returns An object containing the state of the interface.
   */
  async resolveInterface(
    id: string,
    value: Json,
  ): Promise<ResolveInterfaceResult> {
    return snap.request({
      method: 'snap_resolveInterface',
      params: {
        id,
        value,
      },
    });
  }

  /**
   * Shows a dialog using the provided ID.
   *
   * @param id - The ID for the dialog.
   * @returns A promise that resolves to a string.
   */
  async showDialog(id: string): Promise<DialogResult> {
    return snap.request({
      method: 'snap_dialog',
      params: {
        id,
      },
    });
  }

  /**
   * Get preferences from snap.
   *
   * @returns A promise that resolves to snap preferences.
   */
  async getPreferences(): Promise<Preferences> {
    return snap.request({
      method: 'snap_getPreferences',
    }) as Promise<Preferences>;
  }

  /**
   * Retrieves the client status (locked/unlocked) in this case from MM.
   *
   * @returns An object containing the status.
   */
  async getClientStatus(): Promise<GetClientStatusResult> {
    return snap.request({
      method: 'snap_getClientStatus',
    });
  }

  /**
   * Schedules a background event.
   *
   * @param options - The options for the background event.
   * @param options.method - The method to call.
   * @param options.params - The params to pass to the method.
   * @param options.duration - The duration to wait before the event is scheduled.
   * @returns A promise that resolves to a string.
   */
  async scheduleBackgroundEvent({
    method,
    params = {},
    duration,
  }: {
    method: string;
    params?: Record<string, Json>;
    duration: string;
  }): Promise<string> {
    return snap.request({
      method: 'snap_scheduleBackgroundEvent',
      params: {
        duration,
        request: {
          method,
          params,
        },
      },
    });
  }

  /**
   * List all entropy sources.
   *
   * @returns An array of entropy sources.
   */
  async listEntropySources(): Promise<EntropySource[]> {
    return snap.request({
      method: 'snap_listEntropySources',
    });
  }

  /**
   * Track an event in MetaMask analytics.
   *
   * @param event - The event name to track.
   * @param properties - Additional properties to include with the event.
   */
  async trackEvent(
    event: string,
    properties: Record<string, Json>,
  ): Promise<void> {
    try {
      await snap.request({
        method: 'snap_trackEvent',
        params: {
          event: {
            event,
            properties,
          },
        },
      });
    } catch {
      // Silently fail if tracking fails - we don't want to interrupt the user flow
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
  async trackTransactionAdded(properties: {
    origin: string;
    accountType: string;
    chainIdCaip: string;
  }): Promise<void> {
    await this.trackEvent(TransactionEventType.TransactionAdded, {
      message: 'Snap transaction added',
      origin: properties.origin,
      account_type: properties.accountType,
      chain_id_caip: properties.chainIdCaip,
    });
  }

  /**
   * Track a "Transaction Rejected" event when user rejects a transaction.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the request.
   * @param properties.accountType - The type of account.
   * @param properties.chainIdCaip - The CAIP-2 chain ID.
   */
  async trackTransactionRejected(properties: {
    origin: string;
    accountType: string;
    chainIdCaip: string;
  }): Promise<void> {
    await this.trackEvent(TransactionEventType.TransactionRejected, {
      message: 'Snap transaction rejected',
      origin: properties.origin,
      account_type: properties.accountType,
      chain_id_caip: properties.chainIdCaip,
    });
  }

  /**
   * Track a "Transaction Submitted" event when a transaction is successfully broadcast.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the request.
   * @param properties.accountType - The type of account.
   * @param properties.chainIdCaip - The CAIP-2 chain ID.
   */
  async trackTransactionSubmitted(properties: {
    origin: string;
    accountType: string;
    chainIdCaip: string;
  }): Promise<void> {
    await this.trackEvent(TransactionEventType.TransactionSubmitted, {
      message: 'Snap transaction submitted',
      origin: properties.origin,
      account_type: properties.accountType,
      chain_id_caip: properties.chainIdCaip,
    });
  }

  /**
   * Track a "Transaction Approved" event when a transaction is approved.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the request.
   * @param properties.accountType - The type of account.
   * @param properties.chainIdCaip - The CAIP-2 chain ID.
   */
  async trackTransactionApproved(properties: {
    origin: string;
    accountType: string;
    chainIdCaip: string;
  }): Promise<void> {
    await this.trackEvent(TransactionEventType.TransactionApproved, {
      message: 'Snap transaction approved',
      origin: properties.origin,
      account_type: properties.accountType,
      chain_id_caip: properties.chainIdCaip,
    });
  }

  /**
   * Track a "Transaction Finalized" event when a transaction reaches final state.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the request.
   * @param properties.accountType - The type of account.
   * @param properties.chainIdCaip - The CAIP-2 chain ID.
   */
  async trackTransactionFinalized(properties: {
    origin: string;
    accountType: string;
    chainIdCaip: string;
  }): Promise<void> {
    await this.trackEvent(TransactionEventType.TransactionFinalized, {
      message: 'Snap transaction finalized',
      origin: properties.origin,
      account_type: properties.accountType,
      chain_id_caip: properties.chainIdCaip,
    });
  }

  /**
   * Track a "Security Alert Detected" event when a malicious or warning transaction is detected.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the request.
   * @param properties.accountType - The type of account.
   * @param properties.chainIdCaip - The CAIP-2 chain ID.
   * @param properties.securityAlertResponse - The type of security alert (Warning, Malicious).
   * @param properties.securityAlertReason - The reason for the security alert.
   * @param properties.securityAlertDescription - Human-readable description of the alert.
   */
  async trackSecurityAlertDetected(properties: {
    origin: string;
    accountType: string;
    chainIdCaip: string;
    securityAlertResponse: string;
    securityAlertReason: string | null;
    securityAlertDescription: string;
  }): Promise<void> {
    await this.trackEvent(SecurityEventType.SecurityAlertDetected, {
      message: 'Snap security alert detected',
      origin: properties.origin,
      account_type: properties.accountType,
      chain_id_caip: properties.chainIdCaip,
      security_alert_response: properties.securityAlertResponse,
      security_alert_reason: properties.securityAlertReason,
      security_alert_description: properties.securityAlertDescription,
    });
  }

  /**
   * Track a "Security Scan Completed" event when a transaction security scan finishes.
   *
   * @param properties - Event properties.
   * @param properties.origin - The origin of the request.
   * @param properties.accountType - The type of account.
   * @param properties.chainIdCaip - The CAIP-2 chain ID.
   * @param properties.scanStatus - The status of the scan (SUCCESS, ERROR).
   * @param properties.hasSecurityAlerts - Whether security alerts were detected.
   */
  async trackSecurityScanCompleted(properties: {
    origin: string;
    accountType: string;
    chainIdCaip: string;
    scanStatus: string;
    hasSecurityAlerts: boolean;
  }): Promise<void> {
    await this.trackEvent(SecurityEventType.SecurityScanCompleted, {
      message: 'Snap security scan completed',
      origin: properties.origin,
      account_type: properties.accountType,
      chain_id_caip: properties.chainIdCaip,
      scan_status: properties.scanStatus,
      has_security_alerts: properties.hasSecurityAlerts,
    });
  }
}
