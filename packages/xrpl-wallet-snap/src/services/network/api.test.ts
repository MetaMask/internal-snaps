import { encode } from 'xrpl';

import {
  BaseTxResponseStruct,
  BaseTxResultStruct,
  LedgerEntryRequestStruct,
  MptHolderNodeStruct,
  MptIssuanceNodeStruct,
  SubmitRequestStruct,
  TxJsonStruct,
  XrplTransactionType,
} from './api';

const account = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const destination = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const issuer = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';
const transactionHash =
  'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
const issuanceId = '05FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3';
const mptokenIndex =
  'A6C5A4E7B2F1D0C9B8A796857463524110FEDCBBA9876543210FEDCBA9876543';
const txBlob = encode({
  TransactionType: 'Payment',
  Account: account,
  Destination: destination,
  Amount: '1000000',
  Fee: '12',
  Sequence: 1,
});

const paymentTxJson = {
  TransactionType: XrplTransactionType.Payment,
  Account: account,
};

describe('TxJsonStruct', () => {
  it.each([
    {
      scenario: 'Payment',
      value: paymentTxJson,
      expected: true,
    },
    {
      scenario: 'MPTokenAuthorize with issuance id',
      value: {
        TransactionType: XrplTransactionType.MPTokenAuthorize,
        Account: account,
        MPTokenIssuanceID: issuanceId,
      },
      expected: true,
    },
    {
      scenario: 'Batch with RawTransactions',
      value: {
        TransactionType: XrplTransactionType.Batch,
        Account: account,
        RawTransactions: [
          {
            RawTransaction: {
              TransactionType: XrplTransactionType.Payment,
              Account: account,
            },
          },
        ],
      },
      expected: true,
    },
    {
      scenario: 'unknown transaction type',
      value: {
        TransactionType: 'MPTokenMint',
        Account: account,
      },
      expected: false,
    },
    {
      scenario: 'missing Account',
      value: {
        TransactionType: XrplTransactionType.Payment,
      },
      expected: false,
    },
  ])('$scenario → $expected', ({ value, expected }) => {
    expect(TxJsonStruct.is(value)).toBe(expected);
  });
});

describe('BaseTxResultStruct', () => {
  it.each([
    {
      scenario: 'entry with meta',
      value: {
        hash: transactionHash,
        meta: { TransactionResult: 'tesSUCCESS' },
        tx_json: paymentTxJson,
      },
      expected: true,
    },
    {
      scenario: 'entry without meta',
      value: {
        hash: transactionHash,
        tx_json: paymentTxJson,
      },
      expected: true,
    },
    {
      scenario: 'missing hash',
      value: {
        meta: { TransactionResult: 'tesSUCCESS' },
        tx_json: paymentTxJson,
      },
      expected: false,
    },
  ])('$scenario → $expected', ({ value, expected }) => {
    expect(BaseTxResultStruct.is(value)).toBe(expected);
  });
});

describe('BaseTxResponseStruct', () => {
  it.each([
    {
      scenario: 'pending with validated false and no meta',
      value: {
        result: {
          status: 'success',
          validated: false,
          hash: transactionHash,
          tx_json: paymentTxJson,
        },
      },
      expected: true,
    },
    {
      scenario: 'pending with validated omitted and no meta',
      value: {
        result: {
          status: 'success',
          hash: transactionHash,
          tx_json: paymentTxJson,
        },
      },
      expected: true,
    },
    {
      scenario: 'pending with meta still present',
      value: {
        result: {
          status: 'success',
          validated: false,
          hash: transactionHash,
          meta: { TransactionResult: 'tesSUCCESS' },
          tx_json: paymentTxJson,
        },
      },
      expected: true,
    },
    {
      scenario: 'validated with meta object',
      value: {
        result: {
          status: 'success',
          validated: true,
          hash: transactionHash,
          meta: { TransactionResult: 'tesSUCCESS' },
          tx_json: paymentTxJson,
        },
      },
      expected: true,
    },
    {
      scenario: 'validated with binary meta string',
      value: {
        result: {
          status: 'success',
          validated: true,
          hash: transactionHash,
          meta: 'DEADBEEF',
          tx_json: paymentTxJson,
        },
      },
      expected: true,
    },
    {
      scenario: 'validated without meta',
      value: {
        result: {
          status: 'success',
          validated: true,
          hash: transactionHash,
          tx_json: paymentTxJson,
        },
      },
      expected: false,
    },
    {
      scenario: 'missing status',
      value: {
        result: {
          validated: false,
          hash: transactionHash,
          tx_json: paymentTxJson,
        },
      },
      expected: false,
    },
  ])('$scenario → $expected', ({ value, expected }) => {
    expect(BaseTxResponseStruct.is(value)).toBe(expected);
  });
});

describe('MptIssuanceNodeStruct', () => {
  const issuanceNode = {
    LedgerEntryType: 'MPTokenIssuance',
    Flags: 0,
    Issuer: issuer,
  };

  it.each([
    {
      scenario: 'required fields only',
      value: issuanceNode,
      expected: true,
    },
    {
      scenario: 'with optional AssetScale and LockedAmount',
      value: {
        ...issuanceNode,
        AssetScale: 6,
        LockedAmount: '10',
      },
      expected: true,
    },
    {
      scenario: 'wrong LedgerEntryType',
      value: {
        ...issuanceNode,
        LedgerEntryType: 'MPToken',
      },
      expected: false,
    },
  ])('$scenario → $expected', ({ value, expected }) => {
    expect(MptIssuanceNodeStruct.is(value)).toBe(expected);
  });
});

describe('MptHolderNodeStruct', () => {
  const holderNode = {
    LedgerEntryType: 'MPToken',
    Account: account,
    MPTokenIssuanceID: issuanceId,
    Flags: 0,
    MPTAmount: '100000000',
  };

  it.each([
    {
      scenario: 'required fields only',
      value: holderNode,
      expected: true,
    },
    {
      scenario: 'with optional LockedAmount',
      value: {
        ...holderNode,
        LockedAmount: '25',
      },
      expected: true,
    },
    {
      scenario: 'missing MPTAmount',
      value: {
        LedgerEntryType: 'MPToken',
        Account: account,
        MPTokenIssuanceID: issuanceId,
        Flags: 0,
      },
      expected: false,
    },
    {
      scenario: 'wrong LedgerEntryType',
      value: {
        ...holderNode,
        LedgerEntryType: 'MPTokenIssuance',
      },
      expected: false,
    },
  ])('$scenario → $expected', ({ value, expected }) => {
    expect(MptHolderNodeStruct.is(value)).toBe(expected);
  });
});

describe('LedgerEntryRequestStruct', () => {
  it.each([
    {
      scenario: 'mpt_issuance lookup',
      value: {
        ledger_index: 'validated',
        mpt_issuance: issuanceId,
      },
      expected: true,
    },
    {
      scenario: 'mptoken holder key lookup',
      value: {
        ledger_index: 'validated',
        mptoken: {
          account,
          mpt_issuance_id: issuanceId,
        },
      },
      expected: true,
    },
    {
      scenario: 'mptoken index lookup',
      value: {
        ledger_index: 'validated',
        mptoken: mptokenIndex,
      },
      expected: true,
    },
    {
      scenario: 'empty request',
      value: {},
      expected: false,
    },
  ])('$scenario → $expected', ({ value, expected }) => {
    expect(LedgerEntryRequestStruct.is(value)).toBe(expected);
  });
});

describe('SubmitRequestStruct', () => {
  it.each([
    {
      scenario: 'fail_hard true',
      value: {
        tx_blob: txBlob,
        fail_hard: true,
      },
      expected: true,
    },
    {
      scenario: 'fail_hard false',
      value: {
        tx_blob: txBlob,
        fail_hard: false,
      },
      expected: false,
    },
    {
      scenario: 'fail_hard omitted',
      value: {
        tx_blob: txBlob,
      },
      expected: false,
    },
    {
      scenario: 'invalid tx_blob',
      value: {
        tx_blob: '00',
        fail_hard: true,
      },
      expected: false,
    },
  ])('$scenario → $expected', ({ value, expected }) => {
    expect(SubmitRequestStruct.is(value)).toBe(expected);
  });
});
