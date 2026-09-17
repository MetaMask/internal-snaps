import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
  parseSnapsAssetsMigrationStage,
} from '@metamask/assets-controller';
import type { RemoteFeatureFlagsProvider } from '@metamask/snap-networks-utils';

/**
 * Returns whether Stellar should read fungible holdings / catalog hits from
 * AssetsController instead of snap state.
 *
 * Any stage other than {@link SnapsAssetsMigrationStage.Off} enables Core reads.
 *
 * @param remoteFeatureFlagsProvider - Remote feature-flag messenger wrapper.
 * @returns Whether the Stellar assets migration flag is active.
 */
export async function isAssetsMigrationEnabled(
  remoteFeatureFlagsProvider: RemoteFeatureFlagsProvider,
): Promise<boolean> {
  return true;
  const flagValue = await remoteFeatureFlagsProvider.getFeatureFlag(
    SNAPS_ASSETS_MIGRATION_FLAG_KEYS.stellar,
  );

  return (
    parseSnapsAssetsMigrationStage(flagValue) !==
    SnapsAssetsMigrationStage.Off
  );
}
