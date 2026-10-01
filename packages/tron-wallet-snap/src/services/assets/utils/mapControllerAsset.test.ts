import type { Asset } from '@metamask/assets-controller';
import type { CaipAssetType } from '@metamask/utils';

import { Network } from '../../../constants';
import { mapControllerAsset } from './mapControllerAsset';

describe('mapControllerAsset', () => {
  const accountId = 'account-id';
  const unknownAssetId = 'tron:728126428/trc20:unknown';

  it('maps controller metadata when present', () => {
    const asset = {
      id: unknownAssetId,
      chainId: Network.Mainnet,
      balance: { amount: '1.234567' },
      metadata: {
        type: 'fungible',
        symbol: 'TKN',
        name: 'Token',
        decimals: 6,
        image: 'https://example.com/token.png',
      },
      price: { price: 0, lastUpdated: 0 },
      fiatValue: 0,
    } as unknown as Asset;

    expect(mapControllerAsset(accountId, asset)).toStrictEqual({
      assetType: unknownAssetId,
      keyringAccountId: accountId,
      network: Network.Mainnet,
      symbol: 'TKN',
      decimals: 6,
      rawAmount: '1234567',
      uiAmount: '1.234567',
      iconUrl: 'https://example.com/token.png',
    });
  });

  it('uses empty defaults when metadata is missing', () => {
    const assetId = 'tron:728126428/trc20:missing' as CaipAssetType;
    const asset = {
      id: assetId,
      chainId: Network.Mainnet,
      balance: { amount: '42' },
      metadata: { type: 'fungible', name: 'Missing' },
      price: { price: 0, lastUpdated: 0 },
      fiatValue: 0,
    } as unknown as Asset;

    expect(mapControllerAsset(accountId, asset)).toStrictEqual({
      assetType: assetId,
      keyringAccountId: accountId,
      network: Network.Mainnet,
      symbol: '',
      decimals: 0,
      rawAmount: '42',
      uiAmount: '42',
      iconUrl: '',
    });
  });

  it('throws when the asset is not on a supported network', () => {
    const asset = {
      id: 'eip155:1/slip44:60',
      chainId: 'eip155:1',
      balance: { amount: '1' },
      metadata: { type: 'native', symbol: 'ETH', name: 'Ether', decimals: 18 },
      price: { price: 0, lastUpdated: 0 },
      fiatValue: 0,
    } as unknown as Asset;

    expect(() => mapControllerAsset(accountId, asset)).toThrow(
      'Unsupported network: "eip155:1"',
    );
  });
});
