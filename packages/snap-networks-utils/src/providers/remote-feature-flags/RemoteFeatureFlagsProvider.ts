import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { Json } from '@metamask/utils';

import type { MessengerCaller } from '../../types/messenger-caller';

/**
 * Namespace for the {@link RemoteFeatureFlagsProvider} messenger.
 */
export const REMOTE_FEATURE_FLAGS_PROVIDER_NAME =
  'RemoteFeatureFlagsProvider' as const;

/**
 * Actions from other messengers that {@link RemoteFeatureFlagsProvider} calls.
 */
export type RemoteFeatureFlagsProviderAllowedActions =
  RemoteFeatureFlagControllerGetStateAction;

/**
 * Messenger caller for actions consumed by {@link RemoteFeatureFlagsProvider}.
 *
 * Namespace-agnostic so a Snap Core `getMessenger` endowment (which uses the
 * Snap's own namespace and may expose additional actions) is assignable without
 * casts.
 */
export type RemoteFeatureFlagsProviderMessenger =
  MessengerCaller<RemoteFeatureFlagsProviderAllowedActions>;

export class RemoteFeatureFlagsProvider {
  readonly #messenger: RemoteFeatureFlagsProviderMessenger;

  constructor({
    messenger,
  }: {
    messenger: RemoteFeatureFlagsProviderMessenger;
  }) {
    this.#messenger = messenger;
  }

  /**
   * Returns a single remote feature flag value, or `undefined` if missing.
   *
   * @param flagKey - LaunchDarkly / client-config feature flag key.
   * @returns Flag value, or `undefined`.
   */
  async getFeatureFlag(flagKey: string): Promise<Json | undefined> {
    const { remoteFeatureFlags } = await this.#messenger.call(
      'RemoteFeatureFlagController:getState',
    );

    return remoteFeatureFlags[flagKey];
  }

  /**
   * Returns remote feature flag values for the given keys, keyed by flag key.
   * Missing keys are included with value `undefined`.
   *
   * @param flagKeys - Feature flag keys to resolve.
   * @returns Map of flag key → value.
   */
  async getFeatureFlags(
    flagKeys: string[],
  ): Promise<Record<string, Json | undefined>> {
    const { remoteFeatureFlags } = await this.#messenger.call(
      'RemoteFeatureFlagController:getState',
    );

    return flagKeys.reduce<Record<string, Json | undefined>>((acc, flagKey) => {
      acc[flagKey] = remoteFeatureFlags[flagKey];
      return acc;
    }, {});
  }
}
