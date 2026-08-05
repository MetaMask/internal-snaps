import type {
  AssetsControllerGetAccountAssetByIDAction,
  AssetsControllerGetAccountAssetsByIDsAction,
  AssetsControllerGetAccountAssetsByScopeAction,
} from '@metamask/assets-controller';
import type { Messenger } from '@metamask/messenger';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { AsyncMessenger } from '@metamask/snaps-sdk';

/**
 * Namespace for this Snap's Core messenger endowment.
 */
export const TRON_WALLET_SNAP_MESSENGER_NAMESPACE = 'TronWalletSnap' as const;

export type CoreMessengerActions =
  | RemoteFeatureFlagControllerGetStateAction
  | AssetsControllerGetAccountAssetByIDAction
  | AssetsControllerGetAccountAssetsByIDsAction
  | AssetsControllerGetAccountAssetsByScopeAction;

/**
 * Messenger type passed to `getMessenger` for Core controller actions.
 */
export type CoreMessengerMessenger = Messenger<
  typeof TRON_WALLET_SNAP_MESSENGER_NAMESPACE,
  CoreMessengerActions
>;

/**
 * Typed async messenger for Core controller actions available to this Snap via
 * `endowment:messenger` / `getMessenger`.
 */
export type CoreMessenger = AsyncMessenger<CoreMessengerMessenger>;

/**
 * Narrow dependency for services that only need to invoke Core actions.
 */
export type CoreMessengerCaller = Pick<CoreMessenger, 'call'>;
