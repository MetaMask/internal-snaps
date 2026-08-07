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
 * Sync messenger constraint passed to `getMessenger` for Core controller
 * actions. Runtime value is {@link CoreMessenger}.
 */
export type CoreMessengerConstraint = Messenger<
  typeof TRON_WALLET_SNAP_MESSENGER_NAMESPACE,
  CoreMessengerActions
>;

/**
 * Async messenger returned by `getMessenger` for Core controller actions.
 */
export type CoreMessenger = AsyncMessenger<CoreMessengerConstraint>;
