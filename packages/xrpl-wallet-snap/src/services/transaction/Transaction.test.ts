import { KnownCaip2ChainId } from '../../api';
import { toCaip19MptAssetId } from '../../utils';
import { Transaction } from './Transaction';

describe('Transaction.destinationTag', () => {
  it('returns the numeric DestinationTag on a Payment', () => {
    const transaction = new Transaction(
      {
        TransactionType: 'Payment',
        Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
        Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        Amount: '10',
        DestinationTag: 1234,
      },
      KnownCaip2ChainId.Mainnet,
    );

    expect(transaction.destinationTag).toStrictEqual(1234);
  });

  it('returns undefined when the Payment omits DestinationTag', () => {
    const transaction = new Transaction(
      {
        TransactionType: 'Payment',
        Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
        Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        Amount: '10',
      },
      KnownCaip2ChainId.Mainnet,
    );

    expect(transaction.destinationTag).toBeUndefined();
  });
});

describe('Transaction.mptAssetIds', () => {
  it('returns the CAIP-19 id of an MPT payment amount', () => {
    const issuanceId = '05FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3';
    const transaction = new Transaction(
      {
        TransactionType: 'Payment',
        Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
        Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        Amount: {
          mpt_issuance_id: issuanceId,
          value: '10',
        },
      },
      KnownCaip2ChainId.Mainnet,
    );

    expect(transaction.mptAssetIds).toStrictEqual([
      toCaip19MptAssetId(KnownCaip2ChainId.Mainnet, issuanceId),
    ]);
    expect(transaction.iouAssetIds).toStrictEqual([]);
  });
});
