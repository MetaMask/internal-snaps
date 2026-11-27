import { assert, StructError } from '@metamask/superstruct';

import { BatchInnerTransactionStruct, DraftTxJsonStruct } from './api';

const account = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

describe('DraftTxJsonStruct', () => {
  it('accepts a payment that omits NetworkID and uses a numeric destination tag', () => {
    expect(() =>
      assert(
        {
          TransactionType: 'Payment',
          Account: account,
          DestinationTag: 1234,
        },
        DraftTxJsonStruct,
      ),
    ).not.toThrow();
  });

  it('coerces a decimal destination-tag string to a number', () => {
    const draft = DraftTxJsonStruct.create({
      TransactionType: 'Payment',
      Account: account,
      DestinationTag: '1234',
    });
    expect(draft.DestinationTag).toBe(1234);
  });
});

describe('BatchInnerTransactionStruct', () => {
  it('accepts an unsigned inner with a zero fee', () => {
    expect(() =>
      assert(
        {
          TransactionType: 'Payment',
          Account: account,
          Fee: '0',
          SigningPubKey: '',
        },
        BatchInnerTransactionStruct,
      ),
    ).not.toThrow();
  });

  it('rejects a signed inner', () => {
    expect(() =>
      assert(
        {
          TransactionType: 'Payment',
          Account: account,
          TxnSignature: '00',
        },
        BatchInnerTransactionStruct,
      ),
    ).toThrow(StructError);
  });
});
