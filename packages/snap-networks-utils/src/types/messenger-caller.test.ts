import type {
  AssetsControllerGetAccountAssetByIDAction,
  AssetsControllerGetAccountAssetsByIDsAction,
  AssetsControllerGetAccountAssetsByScopeAction,
} from '@metamask/assets-controller';
import type { Messenger } from '@metamask/messenger';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { AsyncMessenger } from '@metamask/snaps-sdk';

import type { MessengerCaller } from './messenger-caller';

type AssetsActions =
  | AssetsControllerGetAccountAssetByIDAction
  | AssetsControllerGetAccountAssetsByIDsAction
  | AssetsControllerGetAccountAssetsByScopeAction;

type CoreActions = AssetsActions | RemoteFeatureFlagControllerGetStateAction;

type CoreAsyncMessenger = AsyncMessenger<
  Messenger<'TestSnapMessenger', CoreActions>
>;

/**
 * Compile-time assertion helper. If `Value` is not assignable to `Target`,
 * TypeScript fails this file.
 *
 * @param value - Value that must be assignable to `Target`.
 * @returns The same value.
 */
function assertAssignable<Target>(value: Target): Target {
  return value;
}

describe('MessengerCaller', () => {
  it('accepts a Core AsyncMessenger that exposes a superset of actions', () => {
    const coreMessenger = {
      call: jest.fn(),
    } as unknown as CoreAsyncMessenger;

    // These assignments must typecheck without casts.
    const assetsCaller: MessengerCaller<AssetsActions> =
      assertAssignable<MessengerCaller<AssetsActions>>(coreMessenger);
    const flagsCaller: MessengerCaller<RemoteFeatureFlagControllerGetStateAction> =
      assertAssignable<
        MessengerCaller<RemoteFeatureFlagControllerGetStateAction>
      >(coreMessenger);

    expect(assetsCaller).toBe(coreMessenger);
    expect(flagsCaller).toBe(coreMessenger);
  });
});
