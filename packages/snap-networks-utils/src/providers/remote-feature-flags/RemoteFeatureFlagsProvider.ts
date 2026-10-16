import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { Json } from '@metamask/utils';

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

type ExtractActionParameters<
  Action extends RemoteFeatureFlagsProviderAllowedActions,
  ActionType extends Action['type'],
> = Action extends {
  type: ActionType;
  handler: (...args: infer HandlerArgs) => unknown;
}
  ? HandlerArgs
  : never;

type ExtractActionResponse<
  Action extends RemoteFeatureFlagsProviderAllowedActions,
  ActionType extends Action['type'],
> = Action extends {
  type: ActionType;
  handler: (...args: never[]) => infer HandlerReturnValue;
}
  ? HandlerReturnValue
  : never;

/**
 * Messenger restricted to actions consumed by {@link RemoteFeatureFlagsProvider}.
 */
export type RemoteFeatureFlagsProviderMessenger = {
  call: <
    ActionType extends RemoteFeatureFlagsProviderAllowedActions['type'],
  >(
    actionType: ActionType,
    ...params: ExtractActionParameters<
      RemoteFeatureFlagsProviderAllowedActions,
      ActionType
    >
  ) => Promise<
    Awaited<
      ExtractActionResponse<
        RemoteFeatureFlagsProviderAllowedActions,
        ActionType
      >
    >
  >;
};

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
