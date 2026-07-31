import type {
  AssetsControllerGetAccountAssetByIDAction,
  AssetsControllerGetAccountAssetsByIDsAction,
  AssetsControllerGetAccountAssetsByScopeAction,
} from '@metamask/assets-controller';
import type { Messenger } from '@metamask/messenger';
import type { AsyncMessenger } from '@metamask/snaps-sdk';

export type {
  AssetsControllerGetAccountAssetByIDAction,
  AssetsControllerGetAccountAssetsByIDsAction,
  AssetsControllerGetAccountAssetsByScopeAction,
};

/**
 * Namespace for the root Snap Core messenger endowment.
 */
export const CORE_MESSENGER_NAMESPACE = 'SnapCore' as const;

export type CoreMessengerActions =
  | AssetsControllerGetAccountAssetByIDAction
  | AssetsControllerGetAccountAssetsByIDsAction
  | AssetsControllerGetAccountAssetsByScopeAction;

/**
 * Typed messenger for Core controller actions available to a Snap via
 * `endowment:messenger` / `getMessenger`.
 */
export type CoreMessenger = Messenger<
  typeof CORE_MESSENGER_NAMESPACE,
  CoreMessengerActions
>;

/**
 * Narrow dependency for services that only need to invoke Core actions.
 */
export type CoreMessengerCaller = Pick<AsyncMessenger<CoreMessenger>, 'call'>;
