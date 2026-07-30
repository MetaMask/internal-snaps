import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
  getSnapsAssetsMigrationNamespace,
  parseSnapsAssetsMigrationStage,
} from '@metamask/assets-controller';
import type { Json } from '@metamask/utils';

import { Network } from '../../constants';
import type { CoreMessengerCaller } from '../../types/core-messenger';

export type AssetsMigrationMode = 'snap' | 'controller';

const ENV_TO_STAGE: Record<string, SnapsAssetsMigrationStage> = {
  off: SnapsAssetsMigrationStage.Off,
  '0': SnapsAssetsMigrationStage.Off,
  'read-assets-controller-without-fallback':
    SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback,
  '2': SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback,
  controller: SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback,
};

/**
 * Collapse Core stages into the two Snap outcomes.
 *
 * @param stage - Resolved migration stage.
 * @returns `'snap'` when Off, otherwise `'controller'`.
 */
export function modeFromStage(
  stage: SnapsAssetsMigrationStage,
): AssetsMigrationMode {
  return stage === SnapsAssetsMigrationStage.Off ? 'snap' : 'controller';
}

/**
 * Extract the migration stage for a chain from remote feature flags.
 *
 * @param remoteFeatureFlags - Remote feature flag payload from the wallet.
 * @param chainId - CAIP-2 chain id for the network.
 * @returns The configured stage, or `undefined` when the flag key is absent.
 */
export function parseStageFromRemoteFlags(
  remoteFeatureFlags: Record<string, unknown> | undefined,
  chainId: string,
): SnapsAssetsMigrationStage | undefined {
  if (!remoteFeatureFlags) {
    return undefined;
  }

  const namespace = getSnapsAssetsMigrationNamespace(chainId);
  if (!namespace) {
    return undefined;
  }

  const flagKey = SNAPS_ASSETS_MIGRATION_FLAG_KEYS[namespace];
  if (!(flagKey in remoteFeatureFlags)) {
    return undefined;
  }

  return parseSnapsAssetsMigrationStage(
    remoteFeatureFlags[flagKey] as Json | undefined,
  );
}

/**
 * Parse a raw `TRON_ASSETS_MIGRATION_STAGE` env value.
 *
 * Only Off and WithoutFallback aliases are accepted. WithFallback and Only
 * strings are rejected so they cannot force controller mode without a remote flag.
 *
 * @param rawStage - Raw env value, possibly undefined.
 * @returns The configured stage, or `undefined` when unset or invalid.
 */
export function parseStageFromEnv(
  rawStage: string | undefined,
): SnapsAssetsMigrationStage | undefined {
  const normalized = rawStage?.trim().toLowerCase();

  if (normalized && normalized in ENV_TO_STAGE) {
    return ENV_TO_STAGE[normalized];
  }

  return undefined;
}

/**
 * Resolve the assets migration mode for a network.
 *
 * Resolution order:
 * 1. Remote feature flags
 * 2. `TRON_ASSETS_MIGRATION_STAGE` in non-production builds
 * 3. `'snap'`
 *
 * @param params - Resolution inputs.
 * @param params.coreMessenger - Messenger used to read remote flags.
 * @param params.chainId - CAIP-2 chain id for the network.
 * @param params.isDev - Whether the Snap is running in a non-production build.
 * @param params.envStage - Parsed env stage override.
 * @returns The resolved migration mode.
 */
export async function resolveAssetsMigrationMode({
  coreMessenger,
  chainId,
  isDev,
  envStage,
}: {
  coreMessenger: CoreMessengerCaller;
  chainId: string;
  isDev: boolean;
  envStage: SnapsAssetsMigrationStage | undefined;
}): Promise<AssetsMigrationMode> {
  const state = await coreMessenger.call('RemoteFeatureFlagController:getState');
  const remoteStage = parseStageFromRemoteFlags(
    state.remoteFeatureFlags,
    chainId,
  );

  if (remoteStage !== undefined) {
    return modeFromStage(remoteStage);
  }

  if (isDev && envStage !== undefined) {
    return modeFromStage(envStage);
  }

  return 'snap';
}

export { SnapsAssetsMigrationStage };
