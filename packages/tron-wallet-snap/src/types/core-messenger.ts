import type { AssetsControllerGetAssetAction } from '@metamask/assets-controller';
import type { Messenger } from '@metamask/messenger';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { AsyncMessenger } from '@metamask/snaps-sdk';

export type { AssetsControllerGetAssetAction };

export type CoreMessengerActions =
  | AssetsControllerGetAssetAction
  | RemoteFeatureFlagControllerGetStateAction;

/**
 * Typed messenger for Core controller actions available to this Snap via
 * `endowment:messenger` / `getMessenger`.
 */
export type CoreMessenger = Messenger<string, CoreMessengerActions>;

/**
 * Narrow dependency for services that only need to invoke Core actions.
 *
 * Prefer this over injecting the full messenger so constructors only receive
 * the surface they use.
 */
export type CoreMessengerCaller = Pick<AsyncMessenger<CoreMessenger>, 'call'>;
