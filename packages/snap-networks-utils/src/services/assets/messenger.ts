import type {
  AssetsControllerGetAccountAssetByIDAction,
  AssetsControllerGetAccountAssetsByIDsAction,
  AssetsControllerGetAccountAssetsByScopeAction,
} from '@metamask/assets-controller';
import type { Messenger } from '@metamask/messenger';
import { AsyncMessenger } from '@metamask/snaps-sdk';

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
export type AssetsServiceMessenger = AsyncMessenger<
  Messenger<typeof ASSETS_SERVICE_NAME, AssetsServiceAllowedActions>
>;
