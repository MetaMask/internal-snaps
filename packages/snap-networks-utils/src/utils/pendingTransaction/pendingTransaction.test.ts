import { TransactionStatus, TransactionType } from '@metamask/keyring-api';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';

import { buildPendingTransaction } from './pendingTransaction';

describe('buildPendingTransaction', () => {
  const account = { id: 'account-1', address: 'address-1' };
  const scope = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as CaipChainId;
  const nativeAsset = {
    symbol: 'SOL',
    assetId:
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501' as CaipAssetType,
  };

  it('builds a native-asset placeholder when no classification is given', () => {
    const result = buildPendingTransaction({
      id: 'signature-1',
      account,
      scope,
      nativeAsset,
    });

    expect(result).toStrictEqual({
      id: 'signature-1',
      account: 'account-1',
      chain: scope,
      status: TransactionStatus.Submitted,
      type: TransactionType.Unknown,
      timestamp: expect.any(Number),
      from: [
        {
          address: 'address-1',
          asset: {
            unit: 'SOL',
            type: nativeAsset.assetId,
            amount: '0',
            fungible: true,
          },
        },
      ],
      to: [],
      fees: [],
      events: [
        { status: TransactionStatus.Submitted, timestamp: expect.any(Number) },
      ],
    });
  });

  it('maps a classification to typed participants', () => {
    const result = buildPendingTransaction({
      id: 'signature-2',
      account,
      scope,
      nativeAsset,
      classification: {
        type: TransactionType.Send,
        from: [
          {
            address: 'address-1',
            assetId: nativeAsset.assetId,
            unit: 'SOL',
            amount: '1.5',
          },
        ],
        to: [
          {
            address: 'address-2',
            assetId: nativeAsset.assetId,
            unit: 'SOL',
            amount: '1.5',
          },
        ],
      },
    });

    expect(result.type).toBe(TransactionType.Send);
    expect(result.from).toStrictEqual([
      {
        address: 'address-1',
        asset: {
          unit: 'SOL',
          type: nativeAsset.assetId,
          amount: '1.5',
          fungible: true,
        },
      },
    ]);
    expect(result.to).toStrictEqual([
      {
        address: 'address-2',
        asset: {
          unit: 'SOL',
          type: nativeAsset.assetId,
          amount: '1.5',
          fungible: true,
        },
      },
    ]);
  });

  it('honors an explicit status override', () => {
    const result = buildPendingTransaction({
      id: 'signature-3',
      account,
      scope,
      nativeAsset,
      status: TransactionStatus.Unconfirmed,
    });

    expect(result.status).toBe(TransactionStatus.Unconfirmed);
    expect(result.events).toStrictEqual([
      { status: TransactionStatus.Unconfirmed, timestamp: expect.any(Number) },
    ]);
  });
});
