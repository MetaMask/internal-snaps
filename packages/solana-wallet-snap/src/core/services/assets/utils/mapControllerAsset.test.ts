import type { Asset } from '@metamask/assets-controller';

import { KnownCaip19Id, Network } from '../../../constants/solana';
import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../../test/mocks/solana-keyring-accounts';
import { mapControllerAsset } from './mapControllerAsset';

/**
 * Builds a controller asset for mapping tests.
 *
 * @param assetId - CAIP-19 asset ID.
 * @param amount - Raw balance amount.
 * @param metadata - Symbol and decimals.
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
  it('maps native SOL assets', async () => {
    const asset = buildControllerAsset(KnownCaip19Id.SolMainnet, '1000000000', {
      symbol: 'SOL',
      decimals: 9,
    });

    const entity = await mapControllerAsset(
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

  it('maps SPL token assets with ATA pubkey', async () => {
    const asset = buildControllerAsset(KnownCaip19Id.UsdcMainnet, '1234567', {
      symbol: 'USDC',
      decimals: 6,
    });

    const entity = await mapControllerAsset(
      MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
      MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
      asset,
    );

    expect(entity).toMatchObject({
      assetType: KnownCaip19Id.UsdcMainnet,
      keyringAccountId: MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
      network: Network.Mainnet,
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'USDC',
      decimals: 6,
      rawAmount: '1234567',
      uiAmount: '1.234567',
    });
    expect(entity).toHaveProperty('pubkey');
    expect(typeof (entity as { pubkey?: string }).pubkey).toBe('string');
  });

  it('uses UNKNOWN and 0 decimals when metadata is missing', async () => {
    const assetId = `${Network.Mainnet}/token:UnknownMint`;
    const asset = {
      id: assetId,
      chainId: Network.Mainnet,
      balance: { amount: '42' },
      metadata: { type: 'fungible', name: 'Missing' },
      price: { price: 0, lastUpdated: 0 },
      fiatValue: 0,
    } as unknown as Asset;

    const entity = await mapControllerAsset(
      MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
      MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
      asset,
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
