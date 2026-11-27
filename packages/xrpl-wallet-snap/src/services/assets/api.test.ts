import { create, is } from '@metamask/superstruct';

import { KnownCaip2ChainId } from '../../api';
import {
  IOU_DECIMAL_PLACES,
  NATIVE_ASSET_SYMBOL,
  XRPL_DECIMAL_PLACES,
} from '../../constants';
import { getSlip44AssetId } from '../../utils';
import {
  USDC_IOU,
  USDC_MPT,
} from '../asset-metadata/__mocks__/assets.fixtures';
import {
  parseCoreXrplAsset,
  parseCoreAssetMetadata,
  CoreAssetStruct,
} from './api';

const NATIVE_ID = getSlip44AssetId(KnownCaip2ChainId.Mainnet);

const nativeAsset = {
  id: NATIVE_ID,
  chainId: KnownCaip2ChainId.Mainnet,
  balance: {
    amount: '5',
    metadata: {
      spendableBalance: '4000000',
      minimumReserveBalance: '1000000',
    },
  },
  metadata: {
    symbol: NATIVE_ASSET_SYMBOL,
    decimals: XRPL_DECIMAL_PLACES,
  },
  price: { value: 0, currency: 'usd' },
  fiatValue: 0,
};

const iouAsset = {
  id: USDC_IOU,
  chainId: KnownCaip2ChainId.Mainnet,
  balance: {
    amount: '0.163007',
    metadata: {
      limit: '1000000',
    },
  },
  metadata: {
    aggregators: ['metamask'],
    decimals: IOU_DECIMAL_PLACES,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/xrpl/0/token/USDC-rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY.png',
    name: 'USDC',
    occurrences: 2,
    symbol: 'USDC',
    type: 'erc20',
  },
  price: {
    id: USDC_IOU,
    price: 0.999682,
    usdPrice: 0.999682,
  },
  fiatValue: 0.1629560634878,
};

const mptAsset = {
  id: USDC_MPT,
  chainId: KnownCaip2ChainId.Mainnet,
  balance: {
    amount: '2',
    metadata: { status: 0 },
  },
  metadata: { symbol: 'USDC', decimals: 6 },
};

describe('CoreAssetStruct', () => {
  it('accepts native slip44 with amount + native balance metadata', () => {
    const parsed = create(nativeAsset, CoreAssetStruct);

    expect(parsed).toMatchObject({
      id: NATIVE_ID,
      chainId: KnownCaip2ChainId.Mainnet,
      balance: {
        amount: '5',
        metadata: {
          spendableBalance: '4000000',
          minimumReserveBalance: '1000000',
        },
      },
      metadata: {
        symbol: NATIVE_ASSET_SYMBOL,
        decimals: XRPL_DECIMAL_PLACES,
      },
    });
  });

  it('accepts IOU assets with human amount and trustline limit', () => {
    expect(is(iouAsset, CoreAssetStruct)).toBe(true);
  });

  it('accepts MPT assets with amount and status metadata', () => {
    expect(is(mptAsset, CoreAssetStruct)).toBe(true);
  });

  it('rejects a non-Xrpl CAIP-19 id', () => {
    expect(
      is(
        {
          ...nativeAsset,
          id: 'eip155:1/slip44:60',
          chainId: 'eip155:1',
        },
        CoreAssetStruct,
      ),
    ).toBe(false);
  });

  it('rejects IOU assets missing balance metadata', () => {
    expect(
      is(
        {
          ...iouAsset,
          balance: { amount: '3' },
        },
        CoreAssetStruct,
      ),
    ).toBe(false);
  });

  it('rejects native assets missing balance metadata', () => {
    expect(
      is(
        {
          ...nativeAsset,
          balance: { amount: '5' },
        },
        CoreAssetStruct,
      ),
    ).toBe(false);
  });

  it('rejects metadata without decimals', () => {
    expect(
      is(
        {
          ...mptAsset,
          metadata: { symbol: 'USDC' },
        },
        CoreAssetStruct,
      ),
    ).toBe(false);
  });
});

describe('parseCoreXrplAsset', () => {
  it('returns the Xrpl-shaped asset for a valid Core payload', () => {
    expect(parseCoreXrplAsset(iouAsset)).toMatchObject({
      id: USDC_IOU,
      chainId: KnownCaip2ChainId.Mainnet,
      balance: {
        amount: '0.163007',
        metadata: { limit: '1000000' },
      },
      metadata: {
        symbol: 'USDC',
        decimals: IOU_DECIMAL_PLACES,
        name: 'USDC',
      },
    });
  });

  it('returns null when the payload is not Xrpl-shaped', () => {
    expect(parseCoreXrplAsset({ id: 'not-an-asset' })).toBeNull();
  });

  it('throws when an XRPL asset id has an invalid body', () => {
    expect(() =>
      parseCoreXrplAsset({
        ...iouAsset,
        balance: { amount: '3' },
      }),
    ).toThrow('Failed to parse Core asset');
  });
});

describe('parseCoreAssetMetadata', () => {
  it('returns symbol, decimals, and optional fields', () => {
    expect(
      parseCoreAssetMetadata({
        symbol: 'USDC',
        decimals: IOU_DECIMAL_PLACES,
        name: 'USD Coin',
        image: 'https://example.test/usdc.png',
      }),
    ).toMatchObject({
      symbol: 'USDC',
      decimals: IOU_DECIMAL_PLACES,
      name: 'USD Coin',
      image: 'https://example.test/usdc.png',
    });
  });

  it('returns null when decimals are missing', () => {
    expect(parseCoreAssetMetadata({ symbol: 'USDC' })).toBeNull();
  });
});
