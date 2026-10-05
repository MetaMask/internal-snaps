import { TransactionStatus } from '@metamask/keyring-api';

import type { FullNodeTransactionInfo } from '../clients/tron-http/types';
import { mapTransactionInfoStatus } from './transactionStatus';

describe('mapTransactionInfoStatus', () => {
  it.each([
    ['SUCCESS', TransactionStatus.Confirmed],
    ['REVERT', TransactionStatus.Failed],
    ['OUT_OF_ENERGY', TransactionStatus.Failed],
    ['TRANSFER_FAILED', TransactionStatus.Failed],
  ])('maps receipt result %s to %s', (result, expected) => {
    expect(
      mapTransactionInfoStatus({
        receipt: { result },
      } as FullNodeTransactionInfo),
    ).toBe(expected);
  });

  it('treats a missing receipt as confirmed', () => {
    expect(mapTransactionInfoStatus({} as FullNodeTransactionInfo)).toBe(
      TransactionStatus.Confirmed,
    );
  });

  it('treats a receipt without a result as confirmed', () => {
    expect(
      mapTransactionInfoStatus({
        receipt: { net_fee: 100 },
      } as FullNodeTransactionInfo),
    ).toBe(TransactionStatus.Confirmed);
  });
});
