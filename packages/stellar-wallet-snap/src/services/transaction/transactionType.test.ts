import { TransactionType } from '@metamask/keyring-api';
import { Keypair, Networks } from '@stellar/stellar-sdk';

import { buildMockClassicTransaction } from './__mocks__/transaction.fixtures';
import { resolveTransactionType } from './transactionType';

describe('resolveTransactionType', () => {
  const accountAddress = Keypair.random().publicKey();
  const otherAddress = Keypair.random().publicKey();
  const source = { accountId: accountAddress, sequence: '1' };

  it('reports a payment from the account as a send', () => {
    const transaction = buildMockClassicTransaction(
      [
        {
          type: 'payment',
          params: {
            destination: otherAddress,
            asset: 'native',
            amount: '1',
          },
        },
      ],
      { networkPassphrase: Networks.PUBLIC, source },
    );

    expect(resolveTransactionType(transaction, accountAddress)).toBe(
      TransactionType.Send,
    );
  });

  it('reports a self path payment as a swap', () => {
    const transaction = buildMockClassicTransaction(
      [
        {
          type: 'pathPaymentStrictSend',
          params: {
            sendAsset: 'native',
            sendAmount: '1',
            destination: accountAddress,
            destAsset: { code: 'USDC', issuer: otherAddress },
            destMin: '1',
          },
        },
      ],
      { networkPassphrase: Networks.PUBLIC, source },
    );

    expect(resolveTransactionType(transaction, accountAddress)).toBe(
      TransactionType.Swap,
    );
  });

  it('reports an incoming payment as a receive', () => {
    const transaction = buildMockClassicTransaction(
      [
        {
          type: 'payment',
          params: {
            destination: accountAddress,
            asset: 'native',
            amount: '1',
          },
        },
      ],
      {
        networkPassphrase: Networks.PUBLIC,
        source: { accountId: otherAddress, sequence: '1' },
      },
    );

    expect(resolveTransactionType(transaction, accountAddress)).toBe(
      TransactionType.Receive,
    );
  });

  it('reports a trustline opt-in as a token approval', () => {
    const transaction = buildMockClassicTransaction(
      [
        {
          type: 'changeTrust',
          params: {
            asset: { code: 'USDC', issuer: otherAddress },
            limit: '100',
          },
        },
      ],
      { networkPassphrase: Networks.PUBLIC, source },
    );

    expect(resolveTransactionType(transaction, accountAddress)).toBe(
      TransactionType.TokenApprove,
    );
  });

  it('reports a trustline opt-out as a token disapproval', () => {
    const transaction = buildMockClassicTransaction(
      [
        {
          type: 'changeTrust',
          params: {
            asset: { code: 'USDC', issuer: otherAddress },
            limit: '0',
          },
        },
      ],
      { networkPassphrase: Networks.PUBLIC, source },
    );

    expect(resolveTransactionType(transaction, accountAddress)).toBe(
      TransactionType.TokenDisapprove,
    );
  });

  it('reports an unrecognized operation as unknown', () => {
    const transaction = buildMockClassicTransaction(
      [{ type: 'setOptions', params: { setFlags: 1 } }],
      { networkPassphrase: Networks.PUBLIC, source },
    );

    expect(resolveTransactionType(transaction, accountAddress)).toBe(
      TransactionType.Unknown,
    );
  });
});
