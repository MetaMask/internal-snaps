import type {
  AssetsControllerGetAccountAssetByIDAction,
  AssetsControllerGetAccountAssetsByIDsAction,
  AssetsControllerGetAccountAssetsByScopeAction,
} from '@metamask/assets-controller';
import type { Messenger } from '@metamask/messenger';

import type { MessengerCaller } from '../../types/messenger-caller';

export type {
  AssetsControllerGetAccountAssetByIDAction,
  AssetsControllerGetAccountAssetsByIDsAction,
  AssetsControllerGetAccountAssetsByScopeAction,
};

/**
 * Namespace for the {@link AssetsService} messenger.
 */
export const ASSETS_SERVICE_NAME = 'AssetsService' as const;

/**
 * Actions from other messengers that {@link AssetsService} calls.
 */
export type AssetsServiceAllowedActions =
  | AssetsControllerGetAccountAssetByIDAction
  | AssetsControllerGetAccountAssetsByIDsAction
  | AssetsControllerGetAccountAssetsByScopeAction;

/**
 * Messenger restricted to actions consumed by {@link AssetsService}.
 */
export type AssetsServiceMessenger = Messenger<
  typeof ASSETS_SERVICE_NAME,
  AssetsServiceAllowedActions
>;

/**
 * Caller type for {@link AssetsService}.
 *
 * Matches {@link CoreMessengerCaller} while `CoreMessenger` only delegates
 * assets-controller actions.
 */
export type AssetsServiceMessengerCaller =
  MessengerCaller<AssetsServiceAllowedActions>;
