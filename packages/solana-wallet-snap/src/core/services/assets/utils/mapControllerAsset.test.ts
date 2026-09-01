import type { Asset } from '@metamask/assets-controller';

import { KnownCaip19Id, Network } from '../../../constants/solana';
import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../../test/mocks/solana-keyring-accounts';
import { mapControllerAsset } from './mapControllerAsset';

/**
 * Builds a controller asset for mapping tests.
 *
 * @param assetId - CAIP-19 asset ID.
 * @param amount - Display-formatted balance amount.
 * @param metadata - Symbol and decimals.
 * @param metadata.symbol - Asset symbol.
 * @param metadata.decimals - Asset decimals.
 * @returns A controller `Asset`.
 */
function buildControllerAsset(
  assetId: string,
  amount: string,
  metadata: { symbol: string; decimals: number },
): Asset {
  return {
    id: assetId as Asset['id'],
    chainId: Network.Mainnet as Asset['chainId'],
    balance: { amount },
    metadata: {
      type: 'fungible',
      symbol: metadata.symbol,
      name: metadata.symbol,
      decimals: metadata.decimals,
    },
    price: { price: 0, lastUpdated: 0 },
    fiatValue: 0,
  } as Asset;
}

describe('mapControllerAsset', () => {
  it('maps native SOL assets', () => {
    const asset = buildControllerAsset(KnownCaip19Id.SolMainnet, '1', {
      symbol: 'SOL',
      decimals: 9,
    });

    const entity = mapControllerAsset(
      MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
      MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
      asset,
    );

    expect(entity).toStrictEqual({
      assetType: KnownCaip19Id.SolMainnet,
      keyringAccountId: MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
      network: Network.Mainnet,
      address: MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
      symbol: 'SOL',
      decimals: 9,
      rawAmount: '1000000000',
      uiAmount: '1',
    });
  });

  it('maps SPL token assets with the provided associated token account pubkey', () => {
    const asset = buildControllerAsset(KnownCaip19Id.UsdcMainnet, '1.234567', {
      symbol: 'USDC',
      decimals: 6,
    });
    const tokenAccountPubkey = '9wt9PfjPD3JCy5r7o4K1cTGiuTG7fq2pQhdDCdQALKjg';

    const entity = mapControllerAsset(
      MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
      MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
      asset,
      tokenAccountPubkey,
    );

    expect(entity).toStrictEqual({
      assetType: KnownCaip19Id.UsdcMainnet,
      keyringAccountId: MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
      network: Network.Mainnet,
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      pubkey: tokenAccountPubkey,
      symbol: 'USDC',
      decimals: 6,
      rawAmount: '1234567',
      uiAmount: '1.234567',
    });
  });

  it('maps an SPL token without a token account pubkey', () => {
    const asset = buildControllerAsset(KnownCaip19Id.UsdcMainnet, '1234567', {
      symbol: 'USDC',
      decimals: 6,
    });

    expect(
      mapControllerAsset(
        MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
        MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
        asset,
      ),
    ).not.toHaveProperty('pubkey');
  });

  it('uses UNKNOWN and 0 decimals when metadata is missing', () => {
    const assetId = KnownCaip19Id.UsdcMainnet;
    const asset = {
      id: assetId,
      chainId: Network.Mainnet,
      balance: { amount: '42' },
      metadata: { type: 'fungible', name: 'Missing' },
      price: { price: 0, lastUpdated: 0 },
      fiatValue: 0,
    } as unknown as Asset;

    const entity = mapControllerAsset(
      MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
      MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
      asset,
      '9wt9PfjPD3JCy5r7o4K1cTGiuTG7fq2pQhdDCdQALKjg',
    );

    expect(entity).toMatchObject({
      assetType: assetId,
      symbol: 'UNKNOWN',
      decimals: 0,
      rawAmount: '42',
      uiAmount: '42',
    });
  });
});
