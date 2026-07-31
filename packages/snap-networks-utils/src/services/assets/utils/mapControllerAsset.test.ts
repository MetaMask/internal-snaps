import type {
  AccountId,
  Asset,
  Caip19AssetId,
} from '@metamask/assets-controller';

import { mapControllerAsset } from './mapControllerAsset';

describe('mapControllerAsset', () => {
  const accountId = '550e8400-e29b-41d4-a716-446655440000' as AccountId;
  const assetId = 'tron:728126428/trc20:unknown' as Caip19AssetId;

  it('maps controller metadata when present', () => {
    const asset = {
      balance: { amount: '1234567' },
      metadata: {
        symbol: 'TKN',
        decimals: 6,
        image: 'https://example.com/token.png',
      },
    } as unknown as Asset;

    expect(mapControllerAsset(accountId, assetId, asset)).toStrictEqual({
      assetType: assetId,
      keyringAccountId: accountId,
      network: 'tron:728126428',
      symbol: 'TKN',
      decimals: 6,
      rawAmount: '1234567',
      uiAmount: '1.234567',
      iconUrl: 'https://example.com/token.png',
    });
  });

  it('uses empty iconUrl when metadata has no image', () => {
    const asset = {
      balance: { amount: '42' },
      metadata: {
        symbol: 'TKN',
        decimals: 0,
      },
    } as unknown as Asset;

    expect(mapControllerAsset(accountId, assetId, asset)).toStrictEqual({
      assetType: assetId,
      keyringAccountId: accountId,
      network: 'tron:728126428',
      symbol: 'TKN',
      decimals: 0,
      rawAmount: '42',
      uiAmount: '42',
      iconUrl: '',
    });
  });
});
