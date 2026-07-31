import type { Asset } from '@metamask/assets-controller';
import type { CaipChainId } from '@metamask/utils';

import type { CoreMessengerCaller } from '../../types/core-messenger';
import { AssetsService } from './AssetsService';

const ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';
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

type WithAssetsServiceCallback<ReturnValue> = (params: {
  service: AssetsService;
  call: jest.MockedFunction<CoreMessengerCaller['call']>;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * Wraps AssetsService tests with a fresh instance and a messenger `call` mock.
 *
 * @param call - Mocked Core messenger `call` implementation.
 * @param testFunction - Test body receiving the service and mock.
 * @returns The return value of the callback.
 */
async function withAssetsService<ReturnValue>(
  call: jest.MockedFunction<CoreMessengerCaller['call']>,
  testFunction: WithAssetsServiceCallback<ReturnValue>,
): Promise<ReturnValue> {
  const service = new AssetsService({
    coreMessenger: { call },
  });

  return await testFunction({ service, call });
}

describe('AssetsService', () => {
  describe('getAccountAssetByID', () => {
    it('returns a mapped asset when the controller has it', async () => {
      const call = jest.fn().mockResolvedValue(controllerAsset);

      await withAssetsService(call, async ({ service }) => {
        expect(
          await service.getAccountAssetByID(ACCOUNT_ID, ASSET_ID),
        ).toStrictEqual(mappedAsset);

        expect(call).toHaveBeenCalledWith(
          'AssetsController:getAsset',
          ACCOUNT_ID,
          ASSET_ID,
        );
      });
    });

    it('returns null when the controller has no asset', async () => {
      const call = jest.fn().mockResolvedValue(undefined);

      await withAssetsService(call, async ({ service }) => {
        expect(
          await service.getAccountAssetByID(ACCOUNT_ID, ASSET_ID),
        ).toBeNull();
      });
    });
  });

  describe('getAccountAssetsByIDs', () => {
    it('returns an empty map for an empty request', async () => {
      const call = jest.fn();

      await withAssetsService(call, async ({ service }) => {
        expect(
          await service.getAccountAssetsByIDs(ACCOUNT_ID, []),
        ).toStrictEqual({});
        expect(call).not.toHaveBeenCalled();
      });
    });

    it('returns a map keyed by asset ID with nulls for missing assets', async () => {
      const missingId = 'tron:728126428/trc20:missing';
      const call = jest.fn().mockResolvedValue({
        [ACCOUNT_ID]: {
          [ASSET_ID]: controllerAsset,
        },
      });

      await withAssetsService(call, async ({ service }) => {
        expect(
          await service.getAccountAssetsByIDs(ACCOUNT_ID, [
            missingId,
            ASSET_ID,
          ]),
        ).toStrictEqual({
          [missingId]: null,
          [ASSET_ID]: mappedAsset,
        });

        expect(call).toHaveBeenCalledWith(
          'AssetsController:getAssets',
          [{ id: ACCOUNT_ID }],
          { chainIds: [CHAIN_ID] },
        );
      });
    });

    it('treats a missing account entry as an empty asset map', async () => {
      const call = jest.fn().mockResolvedValue({});

      await withAssetsService(call, async ({ service }) => {
        expect(
          await service.getAccountAssetsByIDs(ACCOUNT_ID, [ASSET_ID]),
        ).toStrictEqual({
          [ASSET_ID]: null,
        });
      });
    });

    it('rejects an empty account ID before calling the controller', async () => {
      const call = jest.fn();

      await withAssetsService(call, async ({ service }) => {
        await expect(
          service.getAccountAssetsByIDs('', [ASSET_ID]),
        ).rejects.toThrow('Account ID must be a non-empty string');
        expect(call).not.toHaveBeenCalled();
      });
    });
  });

  describe('getAccountAssets', () => {
    it('returns all mapped controller assets for an account', async () => {
      const call = jest.fn().mockResolvedValue({
        [ACCOUNT_ID]: {
          [ASSET_ID]: controllerAsset,
        },
      });

      await withAssetsService(call, async ({ service }) => {
        expect(await service.getAccountAssets(ACCOUNT_ID)).toStrictEqual([
          mappedAsset,
        ]);

        expect(call).toHaveBeenCalledWith(
          'AssetsController:getAssets',
          [{ id: ACCOUNT_ID }],
          undefined,
        );
      });
    });

    it('forwards scope chain IDs to the controller', async () => {
      const call = jest.fn().mockResolvedValue({ [ACCOUNT_ID]: {} });

      await withAssetsService(call, async ({ service }) => {
        expect(
          await service.getAccountAssets(ACCOUNT_ID, [CHAIN_ID]),
        ).toStrictEqual([]);

        expect(call).toHaveBeenCalledWith(
          'AssetsController:getAssets',
          [{ id: ACCOUNT_ID }],
          { chainIds: [CHAIN_ID] },
        );
      });
    });

    it('accepts a single scope chain ID', async () => {
      const call = jest.fn().mockResolvedValue({ [ACCOUNT_ID]: {} });

      await withAssetsService(call, async ({ service }) => {
        expect(
          await service.getAccountAssets(ACCOUNT_ID, CHAIN_ID),
        ).toStrictEqual([]);

        expect(call).toHaveBeenCalledWith(
          'AssetsController:getAssets',
          [{ id: ACCOUNT_ID }],
          { chainIds: [CHAIN_ID] },
        );
      });
    });

    it('returns an empty list when the account is missing from the response', async () => {
      const call = jest.fn().mockResolvedValue({});

      await withAssetsService(call, async ({ service }) => {
        expect(await service.getAccountAssets(ACCOUNT_ID)).toStrictEqual([]);
      });
    });
  });
});
