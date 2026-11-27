import { BigNumber } from 'bignumber.js';

import { KnownCaip2ChainId } from '../../api';
import { IOU_DECIMAL_PLACES } from '../../constants';
import {
  getSlip44AssetId,
  toCaip19IouAssetId,
  toCaip19MptAssetId,
} from '../../utils';
import type { SerializableSpendableBalance } from './api';
import { OnChainAssetType, SerializableIouSpendableBalanceStruct } from './api';
import { OnChainAccountException } from './exceptions';
import { OnChainAccount } from './OnChainAccount';

const address = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const issuer = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';
const scope = KnownCaip2ChainId.Mainnet;
const nativeAssetId = getSlip44AssetId(scope);
const usdAssetId = toCaip19IouAssetId(scope, 'USD', issuer);
const eurAssetId = toCaip19IouAssetId(scope, 'EUR', issuer);
const btcAssetId = toCaip19IouAssetId(scope, 'BTC', issuer);
const mptAssetId = toCaip19MptAssetId(
  scope,
  '05FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3',
);

function iouLine(
  currency: string,
  balance: string,
  limit: string,
): SerializableSpendableBalance {
  return SerializableIouSpendableBalanceStruct.create({
    type: OnChainAssetType.Iou,
    assetId: toCaip19IouAssetId(scope, currency, issuer),
    balance,
    decimals: IOU_DECIMAL_PLACES,
    limit,
    qualityIn: 0,
    qualityOut: 0,
  });
}

function fundedAccount(
  balances: SerializableSpendableBalance[],
  ownerCount = 0,
): OnChainAccount {
  return OnChainAccount.fromSerializable({
    accountId: address,
    sequenceNumber: '1',
    scope,
    meta: {
      ownerCount,
      sponsoringAccountCount: 0,
      sponsoringOwnerCount: 0,
      sponsoredOwnerCount: 0,
      paysOwnBaseReserve: true,
      flags: {
        lsfRequireDestTag: true,
        lsfDefaultRipple: false,
      },
    },
    balances,
    rawNativeBalance: '2000000',
  });
}

describe('OnChainAccount', () => {
  it('hides an IOU only when both limit and balance are zero', () => {
    const clearedAssetId = toCaip19IouAssetId(scope, 'CLR', issuer);
    const account = fundedAccount([
      iouLine('USD', '1.5', '10'),
      iouLine('EUR', '0', '10'),
      iouLine('BTC', '1', '0'),
      iouLine('CLR', '0', '0'),
    ]);

    expect(account.getAsset(usdAssetId)?.type).toStrictEqual(
      OnChainAssetType.Iou,
    );
    expect(account.hasAsset(eurAssetId)).toBe(true);
    expect(account.getAsset(eurAssetId)?.type).toStrictEqual(
      OnChainAssetType.Iou,
    );
    expect(account.getAsset(btcAssetId)?.type).toStrictEqual(
      OnChainAssetType.Iou,
    );
    expect(account.getAsset(clearedAssetId)).toBeUndefined();
    expect(account.getRawAsset(clearedAssetId)?.type).toStrictEqual(
      OnChainAssetType.Iou,
    );
    expect(account.assetIds).toStrictEqual([
      nativeAssetId,
      usdAssetId,
      eurAssetId,
      btcAssetId,
    ]);
    expect(account.rawAssetIds).toStrictEqual([
      nativeAssetId,
      usdAssetId,
      eurAssetId,
      btcAssetId,
      clearedAssetId,
    ]);
  });

  it('keeps enabled AccountRoot flags and drops disabled ones', () => {
    const account = fundedAccount([]);

    expect(account.requireDestTag).toBe(true);
    expect(account.toSerializableFull().meta.flags).toStrictEqual({
      lsfRequireDestTag: true,
    });
  });

  it('computes the reserve and the spendable XRP balance', () => {
    const account = fundedAccount([], 1);

    expect(account.ownerCount).toStrictEqual(1);
    expect(account.paysOwnBaseReserve).toBe(true);
    expect(account.minimumReserveBalance.toFixed(0)).toStrictEqual('1200000');
    expect(account.nativeSpendableBalance.toFixed(0)).toStrictEqual('800000');
    expect(account.nativeRawBalance.toFixed(0)).toStrictEqual('2000000');
  });

  it('rejects an asset entry that does not match the asset id', () => {
    const account = fundedAccount([]);

    expect(() =>
      account.setAsset(usdAssetId, {
        type: OnChainAssetType.Mpt,
        assetId: mptAssetId,
        mptAmount: new BigNumber('1'),
        lockedAmount: new BigNumber('0'),
        balance: new BigNumber('1'),
        decimals: 0,
      }),
    ).toThrow(OnChainAccountException);
  });

  it('rejects a snapshot that stores the same asset id twice', () => {
    const line = iouLine('USD', '1.5', '10');

    expect(() => fundedAccount([line, { ...line }])).toThrow(
      OnChainAccountException,
    );
  });

  it('round-trips a self-freeze on an IOU holding', () => {
    const line = SerializableIouSpendableBalanceStruct.create({
      type: OnChainAssetType.Iou,
      assetId: usdAssetId,
      balance: '1.5',
      decimals: IOU_DECIMAL_PLACES,
      limit: '10',
      qualityIn: 0,
      qualityOut: 0,
      freeze: true,
    });
    const account = fundedAccount([line]);

    expect(account.getRawAsset(usdAssetId)).toStrictEqual({
      type: OnChainAssetType.Iou,
      assetId: usdAssetId,
      balance: new BigNumber('1.5'),
      decimals: IOU_DECIMAL_PLACES,
      limit: new BigNumber('10'),
      qualityIn: 0,
      qualityOut: 0,
      freeze: true,
    });
    expect(account.toSerializableFull().balances[1]).toStrictEqual({
      type: OnChainAssetType.Iou,
      assetId: usdAssetId,
      balance: '1.5',
      decimals: IOU_DECIMAL_PLACES,
      limit: '10',
      qualityIn: 0,
      qualityOut: 0,
      noRipple: undefined,
      peerAuthorized: undefined,
      freeze: true,
      freezePeer: undefined,
    });
  });
});
