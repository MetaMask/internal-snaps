import { SnapsAssetsMigrationStage } from '@metamask/assets-controller';
import type { RemoteFeatureFlagsProvider } from '@metamask/snap-networks-utils';
import type { Mocked } from 'vitest';

import type { CoreAssetsAdapter } from '../adapters/CoreAssetsAdapter';
import { AssetsService } from '../AssetsService';

type MockCoreAssetsAdapter = Mocked<
  Pick<
    CoreAssetsAdapter,
    | 'getAccountAssetByID'
    | 'getAccountAssetsByIDs'
    | 'getAccountAssetsByScope'
    | 'getAccountAssets'
    | 'getAssetMetadata'
  >
>;

type MockRemoteFeatureFlagsProvider = Mocked<
  Pick<RemoteFeatureFlagsProvider, 'getFeatureFlag' | 'getFeatureFlags'>
>;

/**
 * Builds an {@link AssetsService} with mocked Core and feature-flag dependencies.
 * Flag defaults to Off.
 *
 * @param options - Optional flag override.
 * @param options.migrationStage - Stage returned by `getFeatureFlag`. Defaults to Off.
 * @returns The service, the Core adapter spy, and the feature-flag provider spy.
 */
export function createMockAssetsService({
  migrationStage = SnapsAssetsMigrationStage.Off,
}: {
  migrationStage?: SnapsAssetsMigrationStage;
} = {}): {
  service: AssetsService;
  coreAdapter: MockCoreAssetsAdapter;
  remoteFeatureFlagsProvider: MockRemoteFeatureFlagsProvider;
} {
  const coreAdapter = {
    getAccountAssetByID: vi.fn(),
    getAccountAssetsByIDs: vi.fn(),
    getAccountAssetsByScope: vi.fn(),
    getAccountAssets: vi.fn(),
    getAssetMetadata: vi.fn().mockResolvedValue(null),
  } as MockCoreAssetsAdapter;

  const remoteFeatureFlagsProvider = {
    getFeatureFlag: vi.fn().mockResolvedValue({
      value: { stage: migrationStage },
    }),
    getFeatureFlags: vi.fn().mockResolvedValue({}),
  } as MockRemoteFeatureFlagsProvider;

  const service = new AssetsService({
    coreAdapter: coreAdapter as unknown as CoreAssetsAdapter,
    remoteFeatureFlagsProvider:
      remoteFeatureFlagsProvider as unknown as RemoteFeatureFlagsProvider,
  });

  return { service, coreAdapter, remoteFeatureFlagsProvider };
}
