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

/**
 * Builds an {@link AssetsService} with a mocked Core adapter.
 *
 * @returns The service and the Core adapter spy.
 */
export function createMockAssetsService(): {
  service: AssetsService;
  coreAdapter: MockCoreAssetsAdapter;
} {
  const coreAdapter = {
    getAccountAssetByID: vi.fn(),
    getAccountAssetsByIDs: vi.fn(),
    getAccountAssetsByScope: vi.fn(),
    getAccountAssets: vi.fn(),
    getAssetMetadata: vi.fn().mockResolvedValue(null),
  } as MockCoreAssetsAdapter;

  const service = new AssetsService({
    coreAdapter: coreAdapter as unknown as CoreAssetsAdapter,
  });

  return { service, coreAdapter };
}
