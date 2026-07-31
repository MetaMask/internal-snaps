import type { Asset } from '@metamask/assets-controller';
import type { CaipChainId } from '@metamask/utils';

import type { CoreMessengerCaller } from '../types/core-messenger';
import { AssetsService } from './AssetsService';

describe('AssetsService', () => {
  const accountId = 'account-id';
  const assetId = 'tron:728126428/slip44:195';
  const chainId = 'tron:728126428' as CaipChainId;
  const controllerAsset = {
    balance: { amount: '1000000' },
    metadata: {
      symbol: 'TRX',
      decimals: 6,
      image: 'https://example.com/trx.png',
    },
  } as unknown as Asset;

  const mappedAsset = {
    assetType: assetId,
    keyringAccountId: accountId,
    network: 'tron:728126428',
    symbol: 'TRX',
    decimals: 6,
    rawAmount: '1000000',
    uiAmount: '1',
    iconUrl: 'https://example.com/trx.png',
  };

  const createService = (
    call: CoreMessengerCaller['call'],
  ): AssetsService =>
    new AssetsService({
      coreMessenger: { call },
    });

  describe('getAccountAssetByID', () => {
    it('returns a mapped asset when the controller has it', async () => {
      const call = jest.fn().mockResolvedValue(controllerAsset);
      const service = createService(call);

      expect(await service.getAccountAssetByID(accountId, assetId)).toStrictEqual(
        mappedAsset,
      );

      expect(call).toHaveBeenCalledWith(
        'AssetsController:getAsset',
        accountId,
        assetId,
      );
    });

    it('returns null when the controller has no asset', async () => {
      const call = jest.fn().mockResolvedValue(undefined);
      const service = createService(call);

      expect(await service.getAccountAssetByID(accountId, assetId)).toBeNull();
    });
  });

  describe('getAccountAssetsByIDs', () => {
    it('returns an empty array for an empty request', async () => {
      const call = jest.fn();
      const service = createService(call);

      expect(await service.getAccountAssetsByIDs(accountId, [])).toStrictEqual(
        [],
      );
      expect(call).not.toHaveBeenCalled();
    });

    it('preserves request order and nulls for missing assets', async () => {
      const missingId = 'tron:728126428/trc20:missing';
      const call = jest.fn().mockResolvedValue({
        [accountId]: {
          [assetId]: controllerAsset,
        },
      });
      const service = createService(call);

      expect(
        await service.getAccountAssetsByIDs(accountId, [missingId, assetId]),
      ).toStrictEqual([null, mappedAsset]);

      expect(call).toHaveBeenCalledWith(
        'AssetsController:getAssets',
        [{ id: accountId }],
        { chainIds: [chainId] },
      );
    });

    it('treats a missing account entry as an empty asset map', async () => {
      const call = jest.fn().mockResolvedValue({});
      const service = createService(call);

      expect(
        await service.getAccountAssetsByIDs(accountId, [assetId]),
      ).toStrictEqual([null]);
    });
  });

  describe('getAccountAssets', () => {
    it('returns all mapped controller assets for an account', async () => {
      const call = jest.fn().mockResolvedValue({
        [accountId]: {
          [assetId]: controllerAsset,
        },
      });
      const service = createService(call);

      expect(await service.getAccountAssets(accountId)).toStrictEqual([
        mappedAsset,
      ]);

      expect(call).toHaveBeenCalledWith(
        'AssetsController:getAssets',
        [{ id: accountId }],
        undefined,
      );
    });

    it('forwards optional chainIds to the controller', async () => {
      const call = jest.fn().mockResolvedValue({ [accountId]: {} });
      const service = createService(call);

      expect(
        await service.getAccountAssets(accountId, {
          chainIds: [chainId],
        }),
      ).toStrictEqual([]);

      expect(call).toHaveBeenCalledWith(
        'AssetsController:getAssets',
        [{ id: accountId }],
        { chainIds: [chainId] },
      );
    });

    it('returns an empty list when the account is missing from the response', async () => {
      const call = jest.fn().mockResolvedValue({});
      const service = createService(call);

      expect(await service.getAccountAssets(accountId)).toStrictEqual([]);
    });
  });
});
