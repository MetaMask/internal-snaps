import { TransactionType } from '@metamask/keyring-api';

import { METAMASK_ORIGIN } from '../constants/solana';
import { resolveTransactionType } from './transactionType';

describe('resolveTransactionType', () => {
  it('uses the classification supplied by the caller when present', () => {
    expect(
      resolveTransactionType({
        origin: METAMASK_ORIGIN,
        transactionType: TransactionType.Receive,
      }),
    ).toBe(TransactionType.Receive);
  });

  it('prefers the supplied classification over the origin-derived one', () => {
    expect(
      resolveTransactionType({
        origin: 'https://example.com',
        transactionType: TransactionType.Swap,
      }),
    ).toBe(TransactionType.Swap);
  });

  it('reports a MetaMask-originated transaction as a send', () => {
    expect(resolveTransactionType({ origin: METAMASK_ORIGIN })).toBe(
      TransactionType.Send,
    );
  });

  it('reports a dApp-originated transaction as unknown', () => {
    expect(resolveTransactionType({ origin: 'https://example.com' })).toBe(
      TransactionType.Unknown,
    );
  });

  it('does not treat the MetaMask origin URL as the MetaMask origin', () => {
    expect(resolveTransactionType({ origin: 'https://metamask.io' })).toBe(
      TransactionType.Unknown,
    );
  });
});
