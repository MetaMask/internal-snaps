import { BigNumber } from 'bignumber.js';

import type { KnownCaip19IouAssetId, KnownCaip19MptAssetId } from '../../api';
import { IOU_DECIMAL_PLACES, NATIVE_ASSET_SYMBOL } from '../../constants';
import { OnChainAssetType } from './api';
import type { IouAssetBalance, MptAssetBalance } from './api';
import {
  getDefaultBalanceEntry,
  MptBalanceEntryStruct,
  MptHolderStatus,
  toIouBalanceEntry,
  toMptBalanceEntry,
  toNativeBalanceEntry,
} from './keyringBalance';

const issuer = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';
const iouAssetId = `xrpl:0/token:USD.${issuer}` as KnownCaip19IouAssetId;
const issuanceId = '05FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3';
const mptAssetId = `xrpl:0/xls33:${issuanceId}` as KnownCaip19MptAssetId;

function iouBalance(
  balance: string,
  limit: string,
  peerAuthorized?: boolean,
): IouAssetBalance {
  return {
    type: OnChainAssetType.Iou,
    assetId: iouAssetId,
    balance: new BigNumber(balance),
    decimals: IOU_DECIMAL_PLACES,
    limit: new BigNumber(limit),
    qualityIn: 0,
    qualityOut: 0,
    peerAuthorized,
  };
}

function mptBalance(amount: string, mptAuthorized?: boolean): MptAssetBalance {
  return {
    type: OnChainAssetType.Mpt,
    assetId: mptAssetId,
    mptAmount: new BigNumber(amount),
    lockedAmount: new BigNumber(0),
    balance: new BigNumber(amount),
    decimals: 6,
    ...(mptAuthorized === undefined ? {} : { mptAuthorized }),
  };
}

describe('toNativeBalanceEntry', () => {
  it('formats amount in display units and keeps spendable and reserve metadata in drops', () => {
    expect(
      toNativeBalanceEntry({
        nativeBalance: new BigNumber(1_500_000),
        spendableBalance: new BigNumber(500_000),
        minimumReserveBalance: new BigNumber(1_000_000),
      }),
    ).toStrictEqual({
      unit: NATIVE_ASSET_SYMBOL,
      amount: '1.5',
      metadata: {
        spendableBalance: '500000',
        minimumReserveBalance: '1000000',
      },
    });
  });
});

describe('toIouBalanceEntry', () => {
  it('uses the currency code, 15 decimal places, and a formatted amount', () => {
    expect(toIouBalanceEntry(iouBalance('1.5', '10'))).toStrictEqual({
      unit: 'USD',
      amount: '1.5',
      metadata: {
        limit: '10',
      },
    });
  });

  it('keeps a small amount as a decimal string', () => {
    expect(
      toIouBalanceEntry(iouBalance('0.00000001', '0', false)),
    ).toStrictEqual({
      unit: 'USD',
      amount: '0.00000001',
      metadata: {
        limit: '0',
      },
    });
  });
});

describe('toMptBalanceEntry', () => {
  it('reports holder opted-in when the issuer has not authorized', () => {
    expect(toMptBalanceEntry(mptBalance('1500000'))).toStrictEqual({
      unit: issuanceId,
      amount: '1.5',
      metadata: {
        status: MptHolderStatus.HolderOptedIn,
      },
    });
  });

  it('sets issuer-authorized when mptAuthorized is true', () => {
    expect(toMptBalanceEntry(mptBalance('1500000', true))).toStrictEqual({
      unit: issuanceId,
      amount: '1.5',
      metadata: {
        status:
          // eslint-disable-next-line no-bitwise -- combine disjoint MptHolderStatus bits
          MptHolderStatus.HolderOptedIn | MptHolderStatus.IssuerAuthorized,
      },
    });
  });
});

describe('MptBalanceEntryStruct status default', () => {
  it('defaults status to inactive when metadata omits it', () => {
    expect(
      MptBalanceEntryStruct.create({
        unit: issuanceId,
        amount: '0',
        metadata: {},
      }).metadata,
    ).toStrictEqual({ status: MptHolderStatus.Inactive });
  });
});

describe('getDefaultBalanceEntry', () => {
  it('returns a zero native balance entry', () => {
    expect(getDefaultBalanceEntry()).toStrictEqual({
      unit: NATIVE_ASSET_SYMBOL,
      amount: '0',
      metadata: {
        spendableBalance: '0',
        minimumReserveBalance: '0',
      },
    });
  });
});
