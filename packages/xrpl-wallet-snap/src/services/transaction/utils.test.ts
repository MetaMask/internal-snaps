import { TransactionStatus } from '@metamask/keyring-api';

import { KnownCaip2ChainId } from '../../api';
import { OnChainAccount } from '../on-chain-account/OnChainAccount';
import { TransactionValidationException } from './exceptions';
import { Transaction } from './Transaction';
import {
  assertMainnetTransaction,
  isDestinationRequiresTag,
  statusFromTxResponse,
} from './utils';

const account = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const destination = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const issuer = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';

describe('statusFromTxResponse', () => {
  it('returns submitted until the ledger validates the tx', () => {
    expect(statusFromTxResponse({})).toStrictEqual(TransactionStatus.Submitted);
    expect(statusFromTxResponse({ validated: false })).toStrictEqual(
      TransactionStatus.Submitted,
    );
  });

  it('returns confirmed for a validated tesSUCCESS result', () => {
    expect(
      statusFromTxResponse({
        validated: true,
        meta: { TransactionResult: 'tesSUCCESS' },
      }),
    ).toStrictEqual(TransactionStatus.Confirmed);
  });

  it('returns failed for a validated non-success result', () => {
    expect(
      statusFromTxResponse({
        validated: true,
        meta: { TransactionResult: 'tecUNFUNDED_PAYMENT' },
      }),
    ).toStrictEqual(TransactionStatus.Failed);
  });
});

describe('assertMainnetTransaction', () => {
  it('accepts a crafted payment that omits NetworkID', () => {
    const transaction = new Transaction(
      {
        TransactionType: 'Payment',
        Account: account,
        Destination: destination,
        Amount: '10',
      },
      KnownCaip2ChainId.Mainnet,
    );

    expect(() => assertMainnetTransaction(transaction)).not.toThrow();
  });

  it('rejects a raw transaction that sets NetworkID', () => {
    const transaction = new Transaction(
      {
        TransactionType: 'Payment',
        Account: account,
        Destination: destination,
        Amount: '10',
        NetworkID: 21337,
      },
      KnownCaip2ChainId.Mainnet,
    );

    expect(() => assertMainnetTransaction(transaction)).toThrow(
      TransactionValidationException,
    );
  });

  it('rejects a batch inner that sets NetworkID', () => {
    const transaction = new Transaction(
      {
        TransactionType: 'Batch',
        Account: account,
        RawTransactions: [
          {
            RawTransaction: {
              TransactionType: 'Payment',
              Account: account,
              Destination: destination,
              Amount: '10',
              NetworkID: 21337,
            },
          },
        ],
      },
      KnownCaip2ChainId.Mainnet,
    );

    expect(() => assertMainnetTransaction(transaction)).toThrow(
      TransactionValidationException,
    );
  });
});

describe('isDestinationRequiresTag', () => {
  function funded(accountId: string, requireDestTag = false): OnChainAccount {
    return OnChainAccount.fromSerializable({
      accountId,
      sequenceNumber: '1',
      scope: KnownCaip2ChainId.Mainnet,
      rawNativeBalance: '20000000',
      meta: {
        ownerCount: 0,
        sponsoringAccountCount: 0,
        sponsoringOwnerCount: 0,
        sponsoredOwnerCount: 0,
        paysOwnBaseReserve: true,
        ...(requireDestTag ? { flags: { lsfRequireDestTag: true } } : {}),
      },
      balances: [],
    });
  }

  it('returns true only for the payment destination', () => {
    expect(
      isDestinationRequiresTag(destination, [
        funded(destination, true),
        funded(issuer, true),
      ]),
    ).toBe(true);
  });

  it('ignores requireDestTag on a preloaded issuer', () => {
    expect(
      isDestinationRequiresTag(destination, [
        funded(destination, false),
        funded(issuer, true),
      ]),
    ).toBe(false);
  });

  it('returns false when the destination was not preloaded', () => {
    expect(isDestinationRequiresTag(destination, [funded(issuer, true)])).toBe(
      false,
    );
  });
});
