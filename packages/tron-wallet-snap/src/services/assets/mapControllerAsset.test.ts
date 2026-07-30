import type { Asset } from '@metamask/assets-controller';
import type { CaipAssetType } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import { KnownCaip19Id, Network, TokenMetadata } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import { toUiAmount } from '../../utils/conversion';

import { mapControllerAsset } from './mapControllerAsset';

describe('mapControllerAsset', () => {
  const accountId = 'account-id';
  const knownAssetId = KnownCaip19Id.TrxMainnet;
  const unknownAssetId = 'tron:728126428/trc20:unknown';

  it('maps controller metadata when present', () => {
    const asset = {
      id: unknownAssetId,
      chainId: Network.Mainnet,
      balance: { amount: '1234567' },
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

    expect(mapControllerAsset(accountId, unknownAssetId, asset)).toStrictEqual({
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

  it('falls back to TokenMetadata when controller metadata is missing', () => {
    const asset = {
      id: knownAssetId,
      chainId: Network.Mainnet,
      balance: { amount: '2000000' },
      metadata: { type: 'fungible', name: 'TRON' },
      price: { price: 0, lastUpdated: 0 },
      fiatValue: 0,
    } as unknown as Asset;

    expect(
      mapControllerAsset(accountId, knownAssetId, asset),
    ).toStrictEqual({
      assetType: knownAssetId,
      keyringAccountId: accountId,
      network: Network.Mainnet,
      symbol: TokenMetadata[knownAssetId].symbol,
      decimals: TokenMetadata[knownAssetId].decimals,
      rawAmount: '2000000',
      uiAmount: '2',
      iconUrl: TokenMetadata[knownAssetId].iconUrl,
    });
  });

  it('uses empty defaults when metadata is missing everywhere', () => {
    const assetId = 'tron:728126428/trc20:missing' as CaipAssetType;
    const asset = {
      id: assetId,
      chainId: Network.Mainnet,
      balance: { amount: '42' },
      metadata: { type: 'fungible', name: 'Missing' },
      price: { price: 0, lastUpdated: 0 },
      fiatValue: 0,
    } as unknown as Asset;

    const { chainId } = parseCaipAssetType(assetId);

    expect(mapControllerAsset(accountId, assetId, asset)).toStrictEqual({
      assetType: assetId,
      keyringAccountId: accountId,
      network: chainId,
      symbol: '',
      decimals: 0,
      rawAmount: '42',
      uiAmount: '42',
      iconUrl: '',
    });
  });
});
