import { create, is } from '@metamask/superstruct';

import { KnownCaip2ChainId } from '../../api';
import { MAX_INT64 } from '../../constants';
import { getSlip44AssetId } from '../../utils';
import {
  USDC_CLASSIC,
  USDC_SEP41,
} from '../asset-metadata/__mocks__/assets.fixtures';
import { parseCoreAsset, parseCoreAssetMetadata, CoreAssetStruct } from './api';

const NATIVE_ID = getSlip44AssetId(KnownCaip2ChainId.Mainnet);

const nativeAsset = {
  id: NATIVE_ID,
  chainId: KnownCaip2ChainId.Mainnet,
  balance: {
    amount: '5',
    metadata: {
      spendableBalance: '40000000',
      minimumReserveBalance: '10000000',
      decimal: 7,
    },
  },
  metadata: { symbol: 'XLM', decimals: 7 },
  price: { value: 0, currency: 'usd' },
  fiatValue: 0,
};

const classicAsset = {
  id: USDC_CLASSIC,
  chainId: KnownCaip2ChainId.Mainnet,
  balance: {
    amount: '0.1630079',
    metadata: {
      limit: MAX_INT64,
      authorized: true,
      sponsored: false,
    },
  },
  metadata: {
    aggregators: ['metamask', 'stellarUnified'],
    decimals: 7,
    image:
      'https://static.cx.metamask.io/api/v2/tokenIcons/assets/stellar/pubnet/asset/USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN.png',
    name: 'USDC',
    occurrences: 2,
    symbol: 'USDC',
    type: 'erc20',
  },
  price: {
    id: USDC_CLASSIC,
    price: 0.999682,
    usdPrice: 0.999682,
  },
  fiatValue: 0.1629560634878,
};

const sep41Asset = {
  id: USDC_SEP41,
  chainId: KnownCaip2ChainId.Mainnet,
  balance: { amount: '2' },
  metadata: { symbol: 'USDC', decimals: 7 },
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
          spendableBalance: '40000000',
          minimumReserveBalance: '10000000',
          decimal: 7,
        },
      },
      metadata: { symbol: 'XLM', decimals: 7 },
      price: { value: 0, currency: 'usd' },
      fiatValue: 0,
    });
  });

  it('accepts classic assets with human amount and stroop trustline limit', () => {
    expect(is(classicAsset, CoreAssetStruct)).toBe(true);
  });

  it('accepts SEP-41 assets with amount-only balance', () => {
    expect(is(sep41Asset, CoreAssetStruct)).toBe(true);
  });

  it('rejects a non-Stellar CAIP-19 id', () => {
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

  it('rejects classic assets missing balance metadata', () => {
    expect(
      is(
        {
          ...classicAsset,
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
          ...sep41Asset,
          metadata: { symbol: 'USDC' },
        },
        CoreAssetStruct,
      ),
    ).toBe(false);
  });
});

describe('parseCoreAsset', () => {
  it('returns the Stellar-shaped asset for a valid Core payload', () => {
    expect(parseCoreAsset(classicAsset)).toMatchObject({
      id: USDC_CLASSIC,
      chainId: KnownCaip2ChainId.Mainnet,
      balance: {
        amount: '0.1630079',
        metadata: { limit: MAX_INT64, authorized: true, sponsored: false },
      },
      metadata: { symbol: 'USDC', decimals: 7, name: 'USDC' },
    });
  });

  it('returns null when the payload is not Stellar-shaped', () => {
    expect(parseCoreAsset({ id: 'not-an-asset' })).toBeNull();
  });
});

describe('parseCoreAssetMetadata', () => {
  it('returns symbol, decimals, and optional fields', () => {
    expect(
      parseCoreAssetMetadata({
        symbol: 'USDC',
        decimals: 7,
        name: 'USD Coin',
        image: 'https://example.test/usdc.png',
      }),
    ).toMatchObject({
      symbol: 'USDC',
      decimals: 7,
      name: 'USD Coin',
      image: 'https://example.test/usdc.png',
    });
  });

  it('returns null when decimals are missing', () => {
    expect(parseCoreAssetMetadata({ symbol: 'USDC' })).toBeNull();
  });
});
