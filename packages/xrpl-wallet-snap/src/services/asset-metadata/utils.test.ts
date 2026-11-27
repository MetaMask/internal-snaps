import { AssetType } from '../../api';
import { KnownCaip2ChainId } from '../../api';
import { NATIVE_ASSET_SYMBOL } from '../../constants';
import {
  getSlip44AssetId,
  toCaip19IouAssetId,
  toCaip19MptAssetId,
} from '../../utils';
import { fallbackDisplayLabel, toXrplAssetMetadata } from './utils';

const scope = KnownCaip2ChainId.Mainnet;
const issuer = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';
const issuanceId = '05FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3';
const mptAssetId = toCaip19MptAssetId(scope, issuanceId);
const iouAssetId = toCaip19IouAssetId(
  scope,
  '524C555344000000000000000000000000000000',
  issuer,
);
const nativeAssetId = getSlip44AssetId(scope);

describe('fallbackDisplayLabel', () => {
  it('decodes an IOU hex currency code', () => {
    expect(fallbackDisplayLabel(iouAssetId)).toStrictEqual('RLUSD');
  });

  it('uses the MPT issuance id', () => {
    expect(fallbackDisplayLabel(mptAssetId)).toStrictEqual(issuanceId);
  });

  it('uses the native XRP symbol', () => {
    expect(fallbackDisplayLabel(nativeAssetId)).toStrictEqual(
      NATIVE_ASSET_SYMBOL,
    );
  });
});

describe('toXrplAssetMetadata', () => {
  it('falls back name and symbol from the asset id when omitted', () => {
    expect(
      toXrplAssetMetadata({
        assetId: iouAssetId,
        decimals: 15,
      }),
    ).toMatchObject({
      assetId: iouAssetId,
      assetType: AssetType.Token,
      symbol: 'RLUSD',
      name: 'RLUSD',
    });
  });

  it('keeps an explicit symbol and defaults name to that symbol', () => {
    expect(
      toXrplAssetMetadata({
        assetId: mptAssetId,
        decimals: 6,
        symbol: 'MPT',
      }),
    ).toMatchObject({
      symbol: 'MPT',
      name: 'MPT',
      assetType: AssetType.Mpt,
    });
  });
});
