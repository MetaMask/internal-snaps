import type { Messenger } from '@metamask/messenger';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import { AsyncMessenger } from '@metamask/snaps-sdk';
import type { Json } from '@metamask/utils';

/**
 * Namespace for the {@link RemoteFeatureFlagProvider} messenger.
 */
export const REMOTE_FEATURE_FLAG_PROVIDER_NAME =
  'RemoteFeatureFlagProvider' as const;

/**
 * Actions from other messengers that {@link RemoteFeatureFlagProvider} calls.
 */
export type RemoteFeatureFlagProviderAllowedActions =
  RemoteFeatureFlagControllerGetStateAction;

/**
 * Messenger restricted to actions consumed by {@link RemoteFeatureFlagProvider}.
 */
export type RemoteFeatureFlagProviderMessenger = AsyncMessenger<
  Messenger<
    typeof REMOTE_FEATURE_FLAG_PROVIDER_NAME,
    RemoteFeatureFlagProviderAllowedActions
  >
>;

export class RemoteFeatureFlagProvider {
  readonly #messenger: RemoteFeatureFlagProviderMessenger;

  constructor({
    messenger,
  }: {
    messenger: RemoteFeatureFlagProviderMessenger;
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
  async getFeatureFlags(flagKeys: string[]): Promise<Record<string, Json | undefined>> {
    const { remoteFeatureFlags } = await this.#messenger.call(
      'RemoteFeatureFlagController:getState',
    );

    return flagKeys.reduce<Record<string, Json | undefined>>((acc, flagKey) => {
      acc[flagKey] = remoteFeatureFlags[flagKey];
      return acc;
    }, {});
  }
}
