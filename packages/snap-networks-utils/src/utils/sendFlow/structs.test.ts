import { create, object, refine, string } from '@metamask/superstruct';
import { CaipAssetTypeStruct, parseCaipAssetType } from '@metamask/utils';
import type { CaipAssetType } from '@metamask/utils';

import {
  Base64Struct,
  PositiveNumberStringStruct,
  createSendFlowStructs,
} from './structs';

const ACCOUNT_ID = '0e6a1f4a-6f6c-4a1e-9f3d-1a2b3c4d5e6f';
const ADDRESS = 'address';
const ASSET_ID = 'tron:728126428/slip44:195';

const localAssetId = refine(
  CaipAssetTypeStruct,
  'local-asset',
  (assetId) => parseCaipAssetType(assetId).chainId === 'tron:728126428',
);

const structs = createSendFlowStructs({
  assetId: localAssetId,
  address: string(),
});

describe('sendFlowStructs', () => {
  describe('PositiveNumberStringStruct', () => {
    it.each(['0', '1', '1.5', '100.0001'])('accepts %s', (value) => {
      expect(() => create(value, PositiveNumberStringStruct)).not.toThrow();
    });

    it.each(['', '-1', '01', '1.', '.5', 'abc'])('rejects %s', (value) => {
      expect(() => create(value, PositiveNumberStringStruct)).toThrow(
        'Expected',
      );
    });
  });

  describe('Base64Struct', () => {
    it.each(['aGVsbG8=', 'aGVsbG8gd29ybGQ='])('accepts %s', (value) => {
      expect(() => create(value, Base64Struct)).not.toThrow();
    });

    it.each(['not base64!', 'aGVsbG8'])('rejects %s', (value) => {
      expect(() => create(value, Base64Struct)).toThrow('Expected');
    });
  });

  describe('createSendFlowStructs', () => {
    it('validates the shared onAddressInput params', () => {
      expect(
        create({ value: ADDRESS }, structs.OnAddressInputParams),
      ).toStrictEqual({ value: ADDRESS });
      expect(() => create({ value: 1 }, structs.OnAddressInputParams)).toThrow(
        'Expected',
      );
    });

    it('validates the shared onAmountInput params', () => {
      expect(
        create(
          { accountId: ACCOUNT_ID, assetId: ASSET_ID, value: '1.5' },
          structs.OnAmountInputParams,
        ),
      ).toStrictEqual({
        accountId: ACCOUNT_ID,
        assetId: ASSET_ID,
        value: '1.5',
      });
    });

    it('validates the shared getMaxSendableAmount params', () => {
      expect(
        create(
          { accountId: ACCOUNT_ID, assetId: ASSET_ID },
          structs.GetMaxSendableAmountParams,
        ),
      ).toStrictEqual({ accountId: ACCOUNT_ID, assetId: ASSET_ID });
    });

    it('validates the shared confirmSend params', () => {
      expect(
        create(
          {
            fromAccountId: ACCOUNT_ID,
            toAddress: ADDRESS,
            amount: '1.5',
            assetId: ASSET_ID,
          },
          structs.ConfirmSendParams,
        ),
      ).toStrictEqual({
        fromAccountId: ACCOUNT_ID,
        toAddress: ADDRESS,
        amount: '1.5',
        assetId: ASSET_ID,
      });
    });

    it('validates the shared computeFee params', () => {
      expect(
        create(
          {
            transaction: 'aGVsbG8=',
            accountId: ACCOUNT_ID,
            scope: 'tron:728126428',
            options: { type: 'TransferContract' },
          },
          structs.ComputeFeeParams,
        ),
      ).toStrictEqual({
        transaction: 'aGVsbG8=',
        accountId: ACCOUNT_ID,
        scope: 'tron:728126428',
        options: { type: 'TransferContract' },
      });
    });

    it('rejects CAIP asset IDs from another chain', () => {
      expect(() =>
        create(
          {
            accountId: ACCOUNT_ID,
            assetId:
              'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501' as CaipAssetType,
            value: '1',
          },
          structs.OnAmountInputParams,
        ),
      ).toThrow('Expected');
    });

    it('applies per-method overrides', () => {
      const overridden = createSendFlowStructs({
        address: string(),
        overrides: {
          OnAmountInputParams: object({
            accountId: string(),
            assetId: string(),
            value: string(),
            to: string(),
          }),
        },
      });

      expect(
        create(
          {
            accountId: ACCOUNT_ID,
            assetId: ASSET_ID,
            value: '1',
            to: ADDRESS,
          },
          overridden.OnAmountInputParams,
        ),
      ).toStrictEqual({
        accountId: ACCOUNT_ID,
        assetId: ASSET_ID,
        value: '1',
        to: ADDRESS,
      });
    });
  });
});
