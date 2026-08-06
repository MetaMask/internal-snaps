import type {
  AssetsControllerGetAccountAssetByIDAction,
  AssetsControllerGetAccountAssetsByIDsAction,
  AssetsControllerGetAccountAssetsByScopeAction,
} from '@metamask/assets-controller';
import type { Messenger } from '@metamask/messenger';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';

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
export type CoreMessenger = Messenger<
  typeof TRON_WALLET_SNAP_MESSENGER_NAMESPACE,
  CoreMessengerActions
>;
