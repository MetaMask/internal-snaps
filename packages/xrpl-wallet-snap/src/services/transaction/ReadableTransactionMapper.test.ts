import { KnownCaip2ChainId } from '../../api';
import { XrplTransactionType } from '../network/api';
import {
  FieldType,
  ReadableTransactionMapper,
} from './ReadableTransactionMapper';
import { Transaction } from './Transaction';

const sender = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const destination = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const issuer = 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B';
const mptIssuanceId = '00000A49C4285355D599D229C809E0AE0C8C738301121220';

const HIDDEN_PARAM_KEYS = [
  'sequence',
  'lastLedgerSequence',
  'fee',
  'signingPubKey',
  'txnSignature',
  'signers',
  'networkID',
  'ticketSequence',
  'accountTxnID',
  'account',
  'transactionType',
  'destinationTag',
  'rawTransactions',
] as const;

describe('ReadableTransactionMapper', () => {
  const mapper = new ReadableTransactionMapper();

  it('maps a native Payment with destination tag', () => {
    const transaction = new Transaction(
      {
        TransactionType: XrplTransactionType.Payment,
        Account: sender,
        Destination: destination,
        Amount: '1000000',
        Fee: '12',
        Sequence: 7,
        LastLedgerSequence: 99,
        DestinationTag: 4242,
        SigningPubKey: 'ED00',
      },
      KnownCaip2ChainId.Mainnet,
    );

    const readable = mapper.map(transaction);

    expect(readable).toMatchObject({
      scope: KnownCaip2ChainId.Mainnet,
      type: XrplTransactionType.Payment,
      account: sender,
      feeDrops: '12',
      destinationTag: 4242,
    });
    expect(readable.params).toStrictEqual(
      expect.arrayContaining([
        {
          key: 'destination',
          value: destination,
          type: FieldType.address,
        },
        {
          key: 'amount',
          value: ['native', '1'],
          type: FieldType.assetWithAmount,
        },
      ]),
    );
    expect(readable.params.map((param) => param.key)).not.toStrictEqual(
      expect.arrayContaining([...HIDDEN_PARAM_KEYS]),
    );
    expect(readable.innerTransactions).toStrictEqual([]);
  });

  it('maps an IOU Payment amount as CODE.issuer', () => {
    const transaction = new Transaction(
      {
        TransactionType: XrplTransactionType.Payment,
        Account: sender,
        Destination: destination,
        Amount: { currency: 'USD', issuer, value: '10.50' },
        Fee: '12',
        Sequence: 1,
      },
      KnownCaip2ChainId.Mainnet,
    );

    const readable = mapper.map(transaction);
    expect(readable.destinationTag).toBeNull();
    expect(readable.params).toContainEqual({
      key: 'amount',
      value: [`USD.${issuer}`, '10.5'],
      type: FieldType.assetWithAmount,
    });
  });

  it('maps an MPT Payment amount with issuance id', () => {
    const transaction = new Transaction(
      {
        TransactionType: XrplTransactionType.Payment,
        Account: sender,
        Destination: destination,
        Amount: { mpt_issuance_id: mptIssuanceId, value: '100' },
        Fee: '12',
        Sequence: 1,
      },
      KnownCaip2ChainId.Mainnet,
    );

    expect(mapper.map(transaction).params).toContainEqual({
      key: 'amount',
      value: [mptIssuanceId, '100'],
      type: FieldType.assetWithAmount,
    });
  });

  it('maps TrustSet LimitAmount', () => {
    const transaction = new Transaction(
      {
        TransactionType: XrplTransactionType.TrustSet,
        Account: sender,
        Fee: '12',
        Sequence: 1,
        LimitAmount: { currency: 'USD', issuer, value: '1000' },
        Flags: 0x00_02_00_00,
      },
      KnownCaip2ChainId.Mainnet,
    );

    const readable = mapper.map(transaction);
    expect(readable.type).toStrictEqual(XrplTransactionType.TrustSet);
    expect(readable.params).toContainEqual({
      key: 'limitAmount',
      value: [`USD.${issuer}`, '1000'],
      type: FieldType.assetWithAmount,
    });
    expect(readable.params).toContainEqual({
      key: 'flags',
      value: 'tfSetNoRipple',
      type: FieldType.text,
    });
  });

  it('maps OfferCreate taker fields', () => {
    const transaction = new Transaction(
      {
        TransactionType: XrplTransactionType.OfferCreate,
        Account: sender,
        Fee: '12',
        Sequence: 1,
        TakerGets: '5000000',
        TakerPays: { currency: 'USD', issuer, value: '3' },
      },
      KnownCaip2ChainId.Mainnet,
    );

    const readable = mapper.map(transaction);
    expect(readable.params).toStrictEqual(
      expect.arrayContaining([
        {
          key: 'takerGets',
          value: ['native', '5'],
          type: FieldType.assetWithAmount,
        },
        {
          key: 'takerPays',
          value: [`USD.${issuer}`, '3'],
          type: FieldType.assetWithAmount,
        },
      ]),
    );
  });

  it('maps MPTokenIssuanceCreate MaximumAmount as raw units, not as XRP', () => {
    const transaction = new Transaction(
      {
        TransactionType: XrplTransactionType.MPTokenIssuanceCreate,
        Account: sender,
        Fee: '12',
        Sequence: 1,
        AssetScale: 6,
        MaximumAmount: '1000000',
      },
      KnownCaip2ChainId.Mainnet,
    );

    const readable = mapper.map(transaction);
    expect(readable.type).toStrictEqual(
      XrplTransactionType.MPTokenIssuanceCreate,
    );
    expect(readable.params).toContainEqual({
      key: 'maximumAmount',
      value: '1000000',
      type: FieldType.text,
    });
    expect(readable.params).not.toContainEqual(
      expect.objectContaining({
        key: 'maximumAmount',
        value: ['native', expect.anything()],
      }),
    );
  });

  it('maps Batch outer flags and recursive inners', () => {
    const transaction = new Transaction(
      {
        TransactionType: XrplTransactionType.Batch,
        Account: sender,
        Fee: '40',
        Sequence: 1,
        Flags: 0x00_01_00_00,
        RawTransactions: [
          {
            RawTransaction: {
              TransactionType: XrplTransactionType.Payment,
              Account: sender,
              Destination: destination,
              Amount: '1000',
              Fee: '0',
              Sequence: 0,
              SigningPubKey: '',
            },
          },
        ],
      },
      KnownCaip2ChainId.Mainnet,
    );

    const readable = mapper.map(transaction);
    expect(readable.type).toStrictEqual(XrplTransactionType.Batch);
    expect(readable.params).toContainEqual({
      key: 'flags',
      value: 'tfAllOrNothing',
      type: FieldType.text,
    });
    expect(readable.params.map((param) => param.key)).not.toContain(
      'rawTransactions',
    );
    expect(readable.innerTransactions).toHaveLength(1);
    expect(readable.innerTransactions[0]).toMatchObject({
      type: XrplTransactionType.Payment,
      account: sender,
      feeDrops: '0',
    });
    expect(readable.innerTransactions[0]?.params).toContainEqual({
      key: 'amount',
      value: ['native', '0.001'],
      type: FieldType.assetWithAmount,
    });
  });
});
