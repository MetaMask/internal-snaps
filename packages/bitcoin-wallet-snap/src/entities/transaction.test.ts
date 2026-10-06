import type { Amount, Transaction } from '@metamask/bitcoindevkit';
import { TransactionType } from '@metamask/keyring-api';
import { mock } from 'jest-mock-extended';

import type { BitcoinAccount } from './account';
import { mapToTransactionType } from './transaction';

describe('mapToTransactionType', () => {
  const createAccount = (sentBtc: number): BitcoinAccount => {
    const sentAmount = mock<Amount>();
    jest.spyOn(sentAmount, 'to_btc').mockReturnValue(sentBtc);

    const account = mock<BitcoinAccount>();
    jest
      .spyOn(account, 'sentAndReceived')
      .mockReturnValue([sentAmount, mock<Amount>()]);
    return account;
  };

  it('classifies a transaction that spends funds as a send', () => {
    const account = createAccount(1);

    expect(mapToTransactionType(account, mock<Transaction>())).toBe(
      TransactionType.Send,
    );
  });

  it('classifies a transaction that spends nothing as a receive', () => {
    const account = createAccount(0);

    expect(mapToTransactionType(account, mock<Transaction>())).toBe(
      TransactionType.Receive,
    );
  });
});
