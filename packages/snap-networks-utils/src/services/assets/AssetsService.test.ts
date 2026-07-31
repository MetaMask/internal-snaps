import type { AccountId, Asset } from '@metamask/assets-controller';
import type { CaipChainId } from '@metamask/utils';

import type { CoreMessengerCaller } from '../../types/core-messenger';
import { AssetsService } from './AssetsService';

const ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000' as AccountId;
const ASSET_ID = 'tron:728126428/slip44:195';
const CHAIN_ID = 'tron:728126428' as CaipChainId;

const controllerAsset = {
  balance: { amount: '1000000' },
  metadata: {
    symbol: 'TRX',
    decimals: 6,
    image: 'https://example.com/trx.png',
  },
} as unknown as Asset;

const mappedAsset = {
  assetType: ASSET_ID,
  keyringAccountId: ACCOUNT_ID,
  network: 'tron:728126428',
  symbol: 'TRX',
  decimals: 6,
  rawAmount: '1000000',
  uiAmount: '1',
  iconUrl: 'https://example.com/trx.png',
};

type WithAssetsServiceCallback<ReturnValue> = (payload: {
  assetsService: AssetsService;
  mockCoreMessenger: jest.Mocked<Pick<CoreMessengerCaller, 'call'>>;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * Wraps tests for AssetsService by creating a fresh service with a mock Core
 * messenger. The callback receives the service and mock for test configuration.
 *
 * @param testFunction - The test body receiving the service and mocks.
 * @returns The return value of the callback.
 */
async function withAssetsService<ReturnValue>(
  testFunction: WithAssetsServiceCallback<ReturnValue>,
): Promise<ReturnValue> {
  const mockCoreMessenger: jest.Mocked<Pick<CoreMessengerCaller, 'call'>> = {
    call: jest.fn(),
  };

  const assetsService = new AssetsService({
    coreMessenger: mockCoreMessenger,
  });

  return await testFunction({
    assetsService,
    mockCoreMessenger,
  });
}

describe('AssetsService', () => {
  describe('getAccountAssetByID', () => {
    it('returns a mapped asset when the controller has it', async () => {
      await withAssetsService(async ({ assetsService, mockCoreMessenger }) => {
        mockCoreMessenger.call.mockResolvedValue(controllerAsset);

        expect(
          await assetsService.getAccountAssetByID(ACCOUNT_ID, ASSET_ID),
        ).toStrictEqual(mappedAsset);

        expect(mockCoreMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAsset',
          ACCOUNT_ID,
          ASSET_ID,
        );
      });
    });

    it('returns null when the controller has no asset', async () => {
      await withAssetsService(async ({ assetsService, mockCoreMessenger }) => {
        mockCoreMessenger.call.mockResolvedValue(undefined);

        expect(
          await assetsService.getAccountAssetByID(ACCOUNT_ID, ASSET_ID),
        ).toBeNull();
      });
    });
  });

  describe('getAccountAssetsByIDs', () => {
    it('returns an empty map for an empty request', async () => {
      await withAssetsService(async ({ assetsService, mockCoreMessenger }) => {
        expect(
          await assetsService.getAccountAssetsByIDs(ACCOUNT_ID, []),
        ).toStrictEqual({});
        expect(mockCoreMessenger.call).not.toHaveBeenCalled();
      });
    });

    it('returns a map keyed by asset ID with nulls for missing assets', async () => {
      const missingId = 'tron:728126428/trc20:missing';

      await withAssetsService(async ({ assetsService, mockCoreMessenger }) => {
        mockCoreMessenger.call.mockResolvedValue({
          [ACCOUNT_ID]: {
            [ASSET_ID]: controllerAsset,
          },
        });

        expect(
          await assetsService.getAccountAssetsByIDs(ACCOUNT_ID, [
            missingId,
            ASSET_ID,
          ]),
        ).toStrictEqual({
          [missingId]: null,
          [ASSET_ID]: mappedAsset,
        });

        expect(mockCoreMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAssets',
          [{ id: ACCOUNT_ID }],
          { chainIds: [CHAIN_ID] },
        );
      });
    });

    it('treats a missing account entry as an empty asset map', async () => {
      await withAssetsService(async ({ assetsService, mockCoreMessenger }) => {
        mockCoreMessenger.call.mockResolvedValue({});

        expect(
          await assetsService.getAccountAssetsByIDs(ACCOUNT_ID, [ASSET_ID]),
        ).toStrictEqual({
          [ASSET_ID]: null,
        });
      });
    });
  });

  describe('getAccountAssetsByScope', () => {
    it('returns all mapped controller assets for an account', async () => {
      await withAssetsService(async ({ assetsService, mockCoreMessenger }) => {
        mockCoreMessenger.call.mockResolvedValue({
          [ACCOUNT_ID]: {
            [ASSET_ID]: controllerAsset,
          },
        });

        expect(
          await assetsService.getAccountAssetsByScope(CHAIN_ID, ACCOUNT_ID),
        ).toStrictEqual([mappedAsset]);

        expect(mockCoreMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAssets',
          [{ id: ACCOUNT_ID }],
          { chainIds: [CHAIN_ID] },
        );
      });
    });

    it('returns an empty list when the account is missing from the response', async () => {
      await withAssetsService(async ({ assetsService, mockCoreMessenger }) => {
        mockCoreMessenger.call.mockResolvedValue({});

        expect(
          await assetsService.getAccountAssetsByScope(CHAIN_ID, ACCOUNT_ID),
        ).toStrictEqual([]);
      });
    });
  });
});
