import { SnapsAssetsMigrationStage } from '@metamask/assets-controller';
import type { RemoteFeatureFlagsProvider } from '@metamask/snap-networks-utils';

import type { CoreAssetsAdapter } from '../adapters/CoreAssetsAdapter';
import { AssetsService } from '../AssetsService';

/**
 * Builds an {@link AssetsService} with a mocked Core adapter. Flag defaults to Off.
 *
 * @param options - Optional Core / flag overrides.
 * @returns The facade and the Core `getAssetMetadata` mock.
 */
export function createMockAssetsService({
  migrationStage = SnapsAssetsMigrationStage.Off,
}: {
  migrationStage?: SnapsAssetsMigrationStage;
} = {}): {
  service: AssetsService;
  getAssetMetadata: jest.Mock;
} {
  const getAssetMetadata = jest.fn().mockResolvedValue(null);
  const coreAdapter = {
    getAssetMetadata,
  } as unknown as CoreAssetsAdapter;

  const remoteFeatureFlagsProvider = {
    getFeatureFlag: jest.fn().mockResolvedValue({
      value: { stage: migrationStage },
    }),
  } as unknown as RemoteFeatureFlagsProvider;

  const service = new AssetsService({
    coreAdapter,
    remoteFeatureFlagsProvider,
  });

  return { service, getAssetMetadata };
}
