import type {
  AccountId,
  Asset,
  Caip19AssetId,
} from '@metamask/assets-controller';
import type { CaipChainId } from '@metamask/utils';

import { AssetsService } from './AssetsService';
import type { AssetsServiceMessengerCaller } from './messenger';

const ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000' as AccountId;
const ASSET_ID = 'tron:728126428/slip44:195' as Caip19AssetId;
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
  mockMessenger: jest.Mocked<Pick<AssetsServiceMessengerCaller, 'call'>>;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * Wraps tests for AssetsService by creating a fresh service with a mock
 * messenger. The callback receives the service and mock for test configuration.
 *
 * @param testFunction - The test body receiving the service and mocks.
 * @returns The return value of the callback.
 */
async function withAssetsService<ReturnValue>(
  testFunction: WithAssetsServiceCallback<ReturnValue>,
): Promise<ReturnValue> {
  const mockMessenger: jest.Mocked<Pick<AssetsServiceMessengerCaller, 'call'>> =
    {
      call: jest.fn(),
    };

  const assetsService = new AssetsService({
    messenger: mockMessenger,
  });

  return await testFunction({
    assetsService,
    mockMessenger,
  });
}

describe('AssetsService', () => {
  describe('getAccountAssetByID', () => {
    it('returns a mapped asset when the controller has it', async () => {
      await withAssetsService(async ({ assetsService, mockMessenger }) => {
        mockMessenger.call.mockResolvedValue(controllerAsset);

        expect(
          await assetsService.getAccountAssetByID(ACCOUNT_ID, ASSET_ID),
        ).toStrictEqual(mappedAsset);

        expect(mockMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAccountAssetByID',
          ACCOUNT_ID,
          ASSET_ID,
        );
      });
    });

    it('returns null when the controller has no asset', async () => {
      await withAssetsService(async ({ assetsService, mockMessenger }) => {
        mockMessenger.call.mockResolvedValue(undefined);

        expect(
          await assetsService.getAccountAssetByID(ACCOUNT_ID, ASSET_ID),
        ).toBeNull();
      });
    });
  });

  describe('getAccountAssetsByIDs', () => {
    it('returns an empty map for an empty request', async () => {
      await withAssetsService(async ({ assetsService, mockMessenger }) => {
        expect(
          await assetsService.getAccountAssetsByIDs(ACCOUNT_ID, []),
        ).toStrictEqual({});
        expect(mockMessenger.call).not.toHaveBeenCalled();
      });
    });

    it('returns a map keyed by asset ID with nulls for missing assets', async () => {
      const missingId = 'tron:728126428/trc20:missing' as Caip19AssetId;

      await withAssetsService(async ({ assetsService, mockMessenger }) => {
        mockMessenger.call.mockResolvedValue({
          [ASSET_ID]: controllerAsset,
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

        expect(mockMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAccountAssetsByIDs',
          ACCOUNT_ID,
          [missingId, ASSET_ID],
        );
      });
    });

    it('treats an empty controller response as all missing assets', async () => {
      await withAssetsService(async ({ assetsService, mockMessenger }) => {
        mockMessenger.call.mockResolvedValue({});

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
      await withAssetsService(async ({ assetsService, mockMessenger }) => {
        mockMessenger.call.mockResolvedValue({
          [ASSET_ID]: controllerAsset,
        });

        expect(
          await assetsService.getAccountAssetsByScope(CHAIN_ID, ACCOUNT_ID),
        ).toStrictEqual([mappedAsset]);

        expect(mockMessenger.call).toHaveBeenCalledWith(
          'AssetsController:getAccountAssetsByScope',
          ACCOUNT_ID,
          CHAIN_ID,
        );
      });
    });

    it('returns an empty list when the controller has no assets', async () => {
      await withAssetsService(async ({ assetsService, mockMessenger }) => {
        mockMessenger.call.mockResolvedValue({});

        expect(
          await assetsService.getAccountAssetsByScope(CHAIN_ID, ACCOUNT_ID),
        ).toStrictEqual([]);
      });
    });
  });
});
