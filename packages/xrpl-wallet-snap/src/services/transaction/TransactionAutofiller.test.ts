import { BigNumber } from 'bignumber.js';
import type { Transaction as XrplTransaction } from 'xrpl';

import { KnownCaip2ChainId } from '../../api';
import type { NetworkService } from '../network';
import { TransactionAutofillerException } from './exceptions';
import {
  TransactionAutofiller,
  TransactionAutofillerFillItems,
} from './TransactionAutofiller';
import { TransactionFeeEstimator } from './TransactionFeeEstimator';

const account = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const destination = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const issuer = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';

function autofiller(): {
  autofiller: TransactionAutofiller;
  networkService: {
    fetchAccountInfo: ReturnType<typeof vi.fn>;
    fetchValidatedLedgerIndex: ReturnType<typeof vi.fn>;
    getBaseFee: ReturnType<typeof vi.fn>;
  };
} {
  const networkService = {
    fetchAccountInfo: vi.fn(async () => ({
      account_data: { Sequence: 10 },
    })),
    fetchValidatedLedgerIndex: vi.fn(async () => 1000),
    getBaseFee: vi.fn(async () => new BigNumber(12)),
  };
  return {
    autofiller: new TransactionAutofiller({
      networkService: networkService as unknown as NetworkService,
      transactionFeeEstimator: new TransactionFeeEstimator({
        networkService: networkService as unknown as NetworkService,
      }),
    }),
    networkService,
  };
}

describe('TransactionAutofiller', () => {
  it('accepts equal issued Amount and DeliverMax objects', async () => {
    const { autofiller: service } = autofiller();
    const filled = await service.autofill(
      {
        TransactionType: 'Payment',
        Account: account,
        Destination: destination,
        Amount: { currency: 'USD', issuer, value: '1.5' },
        DeliverMax: { currency: 'USD', issuer, value: '1.5' },
      },
      KnownCaip2ChainId.Mainnet,
    );

    expect(filled).not.toHaveProperty('DeliverMax');
    expect(filled.TransactionType).toBe('Payment');
    const payment = filled as Extract<
      XrplTransaction,
      { TransactionType: 'Payment' }
    >;
    expect(payment.Amount).toStrictEqual({
      currency: 'USD',
      issuer,
      value: '1.5',
    });
  });

  it('rejects Amount and DeliverMax that differ', async () => {
    const { autofiller: service } = autofiller();
    await expect(
      service.autofill(
        {
          TransactionType: 'Payment',
          Account: account,
          Destination: destination,
          Amount: '10',
          DeliverMax: '11',
        },
        KnownCaip2ChainId.Mainnet,
      ),
    ).rejects.toBeInstanceOf(TransactionAutofillerException);
  });

  it('fills only the selected fillItems', async () => {
    const { autofiller: service, networkService } = autofiller();
    const filled = await service.autofill(
      {
        TransactionType: 'Payment',
        Account: account,
        Destination: destination,
        Amount: '10',
        Sequence: 7,
      },
      KnownCaip2ChainId.Mainnet,
      {
        fillItems: new Set([TransactionAutofillerFillItems.fee]),
      },
    );

    expect(filled.Fee).toBe('120');
    expect(filled.Sequence).toBe(7);
    expect(filled.LastLedgerSequence).toBeUndefined();
    expect(networkService.fetchAccountInfo).not.toHaveBeenCalled();
    expect(networkService.fetchValidatedLedgerIndex).not.toHaveBeenCalled();
    expect(networkService.getBaseFee).toHaveBeenCalledTimes(1);
  });

  it('fills all missing fields when fillItems is omitted', async () => {
    const { autofiller: service, networkService } = autofiller();
    const filled = await service.autofill(
      {
        TransactionType: 'Payment',
        Account: account,
        Destination: destination,
        Amount: '10',
      },
      KnownCaip2ChainId.Mainnet,
    );

    expect(filled.Sequence).toBe(10);
    expect(filled.Fee).toBe('120');
    expect(filled.LastLedgerSequence).toBe(1020);
    expect(networkService.fetchAccountInfo).toHaveBeenCalledTimes(1);
    expect(networkService.fetchValidatedLedgerIndex).toHaveBeenCalledTimes(1);
    expect(networkService.getBaseFee).toHaveBeenCalledTimes(1);
  });

  it('sets Sequence to 0 on batch inners that use a ticket', async () => {
    const { autofiller: service } = autofiller();
    const filled = await service.autofill(
      {
        TransactionType: 'Batch',
        Account: account,
        Flags: 1,
        RawTransactions: [
          {
            RawTransaction: {
              TransactionType: 'Payment',
              Account: account,
              Destination: destination,
              Amount: '10',
              TicketSequence: 42,
              Flags: 0x4000_0000,
            },
          },
        ],
      },
      KnownCaip2ChainId.Mainnet,
    );

    expect(filled.TransactionType).toBe('Batch');
    const batch = filled as Extract<
      XrplTransaction,
      { TransactionType: 'Batch' }
    >;
    const inner = batch.RawTransactions[0]?.RawTransaction;
    expect(inner).toMatchObject({
      TicketSequence: 42,
      Sequence: 0,
      Fee: '0',
      SigningPubKey: '',
    });
  });

  it('overwrites a non-zero Sequence on ticketed batch inners', async () => {
    const { autofiller: service } = autofiller();
    const filled = await service.autofill(
      {
        TransactionType: 'Batch',
        Account: account,
        Flags: 1,
        RawTransactions: [
          {
            RawTransaction: {
              TransactionType: 'Payment',
              Account: account,
              Destination: destination,
              Amount: '10',
              TicketSequence: 42,
              Sequence: 7,
              Flags: 0x4000_0000,
            },
          },
        ],
      },
      KnownCaip2ChainId.Mainnet,
    );

    const batch = filled as Extract<
      XrplTransaction,
      { TransactionType: 'Batch' }
    >;
    expect(batch.RawTransactions[0]?.RawTransaction.Sequence).toBe(0);
  });
});
