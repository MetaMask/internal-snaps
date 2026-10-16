import type {
  AssetsControllerGetAccountAssetByIDAction,
  AssetsControllerGetAccountAssetsByIDsAction,
  AssetsControllerGetAccountAssetsByScopeAction,
  AssetsControllerGetAssetsAction,
} from '@metamask/assets-controller';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';

/**
 * Namespace for this Snap's Core messenger endowment.
 */
export const TRON_WALLET_SNAP_MESSENGER_NAMESPACE = 'TronWalletSnap' as const;

export type CoreMessengerActions =
  | RemoteFeatureFlagControllerGetStateAction
  | AssetsControllerGetAccountAssetByIDAction
  | AssetsControllerGetAccountAssetsByIDsAction
  | AssetsControllerGetAccountAssetsByScopeAction
  | AssetsControllerGetAssetsAction;

type ExtractActionParameters<
  Action extends CoreMessengerActions,
  ActionType extends Action['type'],
> = Action extends {
  type: ActionType;
  handler: (...args: infer HandlerArgs) => unknown;
}
  ? HandlerArgs
  : never;

type ExtractActionResponse<
  Action extends CoreMessengerActions,
  ActionType extends Action['type'],
> = Action extends {
  type: ActionType;
  handler: (...args: never[]) => infer HandlerReturnValue;
}
  ? HandlerReturnValue
  : never;

/**
 * Messenger type passed to `getMessenger` for Core controller actions.
 */
/**
 * Async messenger returned by `getMessenger` for Core controller actions
 * available to this Snap via `endowment:messenger`.
 */
export type CoreMessengerClient = {
  call: <ActionType extends CoreMessengerActions['type']>(
    actionType: ActionType,
    ...params: ExtractActionParameters<CoreMessengerActions, ActionType>
  ) => Promise<
    Awaited<ExtractActionResponse<CoreMessengerActions, ActionType>>
  >;
};

/**
 * Narrow dependency for services that only need to invoke Core actions.
 */
export type CoreMessengerCaller = Pick<CoreMessengerClient, 'call'>;
