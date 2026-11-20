import type { Asset } from '@metamask/assets-controller';

import { KnownCaip19Id, Network, Networks } from '../../../constants';
import { extractSpecialAssetsFromMetadata } from './extractSpecialAssetsFromMetadata';

const ACCOUNT_ID = 'account-id';

function createAsset(id: string, metadata?: unknown): Asset {
  return {
    id,
    chainId: Network.Mainnet,
    balance: { amount: '0', ...(metadata === undefined ? {} : { metadata }) },
    metadata: {
      type: 'fungible',
      symbol: 'TRX',
      name: 'TRX',
      decimals: 6,
      image: '',
    },
    price: { price: 0, lastUpdated: 0 },
    fiatValue: 0,
  } as unknown as Asset;
}

describe('extractSpecialAssetsFromMetadata', () => {
  it('derives every special asset from the TRX balance metadata', () => {
    const result = extractSpecialAssetsFromMetadata({
      accountId: ACCOUNT_ID,
      assets: [
        createAsset(KnownCaip19Id.TrxMainnet, {
          energy: { available: '600', limit: '1000' },
          bandwidth: { available: '500', limit: '2000' },
          staking: {
            energy: '7000000',
            bandwidth: '3000000',
            rewards: '1000000',
            inLockPeriod: '2000000',
            readyForWithdrawal: '4000000',
          },
        }),
      ],
    });

    expect([...result.values()]).toStrictEqual([
      expect.objectContaining({
        assetType: Networks[Network.Mainnet].energy.id,
        rawAmount: '600',
        uiAmount: '600',
      }),
      expect.objectContaining({
        assetType: Networks[Network.Mainnet].maximumEnergy.id,
        rawAmount: '1000',
        uiAmount: '1000',
      }),
      expect.objectContaining({
        assetType: Networks[Network.Mainnet].bandwidth.id,
        rawAmount: '500',
        uiAmount: '500',
      }),
      expect.objectContaining({
        assetType: Networks[Network.Mainnet].maximumBandwidth.id,
        rawAmount: '2000',
        uiAmount: '2000',
      }),
      expect.objectContaining({
        assetType: Networks[Network.Mainnet].stakedForEnergy.id,
        rawAmount: '7000000',
        uiAmount: '7',
      }),
      expect.objectContaining({
        assetType: Networks[Network.Mainnet].stakedForBandwidth.id,
        rawAmount: '3000000',
        uiAmount: '3',
      }),
      expect.objectContaining({
        assetType: Networks[Network.Mainnet].stakingRewards.id,
        rawAmount: '1000000',
        uiAmount: '1',
      }),
      expect.objectContaining({
        assetType: Networks[Network.Mainnet].inLockPeriod.id,
        rawAmount: '2000000',
        uiAmount: '2',
      }),
      expect.objectContaining({
        assetType: Networks[Network.Mainnet].readyForWithdrawal.id,
        rawAmount: '4000000',
        uiAmount: '4',
      }),
    ]);
  });

  it('ignores non-TRX assets and TRX assets without metadata', () => {
    const result = extractSpecialAssetsFromMetadata({
      accountId: ACCOUNT_ID,
      assets: [
        createAsset(KnownCaip19Id.UsdtMainnet, {
          energy: { available: '600', limit: '1000' },
        }),
        createAsset(KnownCaip19Id.TrxMainnet),
      ],
    });

    expect(result.size).toBe(0);
  });

  it('accepts finite numbers and skips malformed sections', () => {
    const result = extractSpecialAssetsFromMetadata({
      accountId: ACCOUNT_ID,
      assets: [
        createAsset(KnownCaip19Id.TrxMainnet, {
          energy: { available: 10, limit: null },
          bandwidth: 'not-a-record',
          staking: { energy: null },
        }),
      ],
    });

    expect(result.size).toBe(1);
    expect(result.get(Networks[Network.Mainnet].energy.id)).toStrictEqual({
      assetType: Networks[Network.Mainnet].energy.id,
      keyringAccountId: ACCOUNT_ID,
      network: Network.Mainnet,
      symbol: Networks[Network.Mainnet].energy.symbol,
      decimals: Networks[Network.Mainnet].energy.decimals,
      rawAmount: '10',
      uiAmount: '10',
      iconUrl: Networks[Network.Mainnet].energy.iconUrl,
    });
  });
});
