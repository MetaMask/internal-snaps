import type { AccountId, Caip19AssetId } from '@metamask/assets-controller';
import type { CaipChainId } from '@metamask/utils';

import type { AssetsProviderMessenger } from './AssetsProvider';
import { AssetsProvider } from './AssetsProvider';

const ACCOUNT_ID: AccountId = '550e8400-e29b-41d4-a716-446655440000';
const ASSET_ID: Caip19AssetId = 'tron:728126428/slip44:195';
const CHAIN_ID: CaipChainId = 'tron:728126428';

type WithAssetsProviderCallback<ReturnValue> = (payload: {
  assetsProvider: AssetsProvider;
  mockMessenger: jest.Mocked<AssetsProviderMessenger>;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * Wraps tests for AssetsProvider by creating a fresh provider with a mock
 * messenger. The callback receives the provider and mock for test configuration.
 *
 * @param testFunction - The test body receiving the provider and mocks.
 * @returns The return value of the callback.
 */
async function withAssetsProvider<ReturnValue>(
  testFunction: WithAssetsProviderCallback<ReturnValue>,
): Promise<ReturnValue> {
  const mockMessenger: jest.Mocked<AssetsProviderMessenger> = {
    call: jest.fn(),
  };

  const assetsProvider = new AssetsProvider({
    messenger: mockMessenger,
  });

  return await testFunction({
    assetsProvider,
    mockMessenger,
  });
}

describe('AssetsProvider', () => {
  describe('getAccountAssetByID', () => {
    it('calls AssetsController:getAccountAssetByID', async () => {
      await withAssetsProvider(async ({ assetsProvider, mockMessenger }) => {
        await assetsProvider.getAccountAssetByID(ACCOUNT_ID, ASSET_ID);

        expect(mockMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAccountAssetByID',
          ACCOUNT_ID,
          ASSET_ID,
        );
      });
    });
  });

  describe('getAccountAssetsByIDs', () => {
    it('calls AssetsController:getAccountAssetsByIDs', async () => {
      const assetIds = [ASSET_ID];

      await withAssetsProvider(async ({ assetsProvider, mockMessenger }) => {
        await assetsProvider.getAccountAssetsByIDs(ACCOUNT_ID, assetIds);

        expect(mockMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAccountAssetsByIDs',
          ACCOUNT_ID,
          assetIds,
        );
      });
    });
  });

  describe('getAccountAssetsByScope', () => {
    it('calls AssetsController:getAccountAssetsByScope', async () => {
      await withAssetsProvider(async ({ assetsProvider, mockMessenger }) => {
        await assetsProvider.getAccountAssetsByScope(CHAIN_ID, ACCOUNT_ID);

        expect(mockMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAccountAssetsByScope',
          ACCOUNT_ID,
          CHAIN_ID,
        );
      });
    });
  });
});
