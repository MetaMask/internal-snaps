import type { Asset } from '@metamask/assets-controller';

import { KnownCaip19Id, Network } from '../../../constants/solana';
import { mapControllerAsset } from './mapControllerAsset';

describe('mapControllerAsset', () => {
  const accountId = 'account-id';
  const address = '7vAssLfvpgS3jT1MUdvuSDpFF2yWmJuUziHSEat3gUJ1';
  const unknownAssetId = `${Network.Mainnet}/token:unknown`;

  it('maps an SPL token asset, keeping the mint', () => {
    const asset = {
      id: KnownCaip19Id.UsdcMainnet,
      chainId: Network.Mainnet,
      balance: { amount: '123.456789' },
      metadata: {
        type: 'fungible',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        image: 'https://example.com/usdc.png',
      },
      price: { price: 0, lastUpdated: 0 },
      fiatValue: 0,
    } as unknown as Asset;

    expect(mapControllerAsset(accountId, asset)).toStrictEqual({
      assetType: KnownCaip19Id.UsdcMainnet,
      keyringAccountId: accountId,
      network: Network.Mainnet,
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'USDC',
      decimals: 6,
      rawAmount: '123456789',
      uiAmount: '123.456789',
    });
  });

  it('maps a native asset with the owner address', () => {
    const asset = {
      id: KnownCaip19Id.SolMainnet,
      chainId: Network.Mainnet,
      balance: { amount: '1.234567891' },
      metadata: {
        type: 'fungible',
        symbol: 'SOL',
        name: 'Solana',
        decimals: 9,
      },
      price: { price: 0, lastUpdated: 0 },
      fiatValue: 0,
    } as unknown as Asset;

    expect(mapControllerAsset(accountId, asset, address)).toStrictEqual({
      assetType: KnownCaip19Id.SolMainnet,
      keyringAccountId: accountId,
      network: Network.Mainnet,
      address,
      symbol: 'SOL',
      decimals: 9,
      rawAmount: '1234567891',
      uiAmount: '1.234567891',
    });
  });

  it('uses empty defaults when metadata is missing', () => {
    const asset = {
      id: unknownAssetId,
      chainId: Network.Mainnet,
      balance: { amount: '42' },
      metadata: { type: 'fungible', name: 'Missing' },
      price: { price: 0, lastUpdated: 0 },
      fiatValue: 0,
    } as unknown as Asset;

    expect(mapControllerAsset(accountId, asset)).toStrictEqual({
      assetType: unknownAssetId,
      keyringAccountId: accountId,
      network: Network.Mainnet,
      mint: 'unknown',
      symbol: '',
      decimals: 0,
      rawAmount: '42',
      uiAmount: '42',
    });
  });

  it('throws on a non-solana chain ID', () => {
    const asset = {
      id: 'eip155:1/slip44:60',
      chainId: 'eip155:1',
      balance: { amount: '1' },
      metadata: { type: 'fungible', decimals: 18 },
      price: { price: 0, lastUpdated: 0 },
      fiatValue: 0,
    } as unknown as Asset;

    expect(() => mapControllerAsset(accountId, asset)).toThrow(
      'Unsupported network: "eip155:1"',
    );
  });

  it('throws on an unsupported Solana asset namespace', () => {
    const asset = {
      id: `${Network.Mainnet}/nft:${address}`,
      chainId: Network.Mainnet,
      balance: { amount: '1' },
      metadata: { type: 'nft' },
      price: { price: 0, lastUpdated: 0 },
      fiatValue: 0,
    } as unknown as Asset;

    expect(() => mapControllerAsset(accountId, asset)).toThrow(
      'Unsupported Solana asset namespace: "nft"',
    );
  });
});
