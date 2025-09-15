import type { JsonSLIP10Node } from '@metamask/key-tree';
import type { EntropySourceId } from '@metamask/keyring-api';
import type {
  DialogResult,
  EntropySource,
  GetClientStatusResult,
  GetInterfaceStateResult,
  Json,
  ResolveInterfaceResult,
} from '@metamask/snaps-sdk';

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
}
