/* eslint-disable @typescript-eslint/naming-convention */
import { Network } from '../../constants';
import {
  TransactionExpirationRefresherService,
  TRANSACTION_METADATA_REFRESH_ERROR,
} from '../transaction-expiration-refresher/TransactionExpirationRefresherService';
import type { TransactionWithMetadata } from '../transaction-expiration-refresher/types';

const createBlock = ({
  number,
  timestamp,
  hashSegment = '1122334455667788',
}: {
  number: number;
  timestamp: number;
  hashSegment?: string;
}) => ({
  blockID: `${'0'.repeat(16)}${hashSegment}${'f'.repeat(32)}`,
  block_header: {
    raw_data: {
      number,
      timestamp,
    },
  },
});

const getRefBlockBytes = (number: number) =>
  number.toString(16).slice(-4).padStart(4, '0');

const createTransaction = ({
  block,
  expiration,
}: {
  block: ReturnType<typeof createBlock>;
  expiration: number;
}) =>
  ({
    visible: false,
    txID: 'original-tx-id',
    raw_data: {
      contract: [
        {
          type: 'TransferContract',
          parameter: {
            type_url: 'type.googleapis.com/protocol.TransferContract',
            value: {
              owner_address: `41${'a'.repeat(40)}`,
              to_address: `41${'b'.repeat(40)}`,
              amount: 1000000,
            },
          },
        },
      ],
      ref_block_bytes: getRefBlockBytes(block.block_header.raw_data.number),
      ref_block_hash: block.blockID.slice(16, 32),
      expiration,
      timestamp: block.block_header.raw_data.timestamp,
    },
    raw_data_hex: 'original-raw-data-hex',
  }) as TransactionWithMetadata;

describe('transaction metadata', () => {
  const now = 1_700_000_000_000;
  const scope = Network.Mainnet;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const createTronWeb = ({
    currentBlock = createBlock({ number: 200_000, timestamp: now }),
    referencedBlock,
  }: {
    currentBlock?: ReturnType<typeof createBlock>;
    referencedBlock?: ReturnType<typeof createBlock>;
  } = {}) => ({
    trx: {
      getCurrentBlock: jest.fn().mockResolvedValue(currentBlock),
      getBlockByNumber: jest
        .fn()
        .mockResolvedValue(referencedBlock ?? currentBlock),
    },
    utils: {
      deserializeTx: {
        deserializeTransaction: jest.fn(),
      },
      transaction: {
        txJsonToPb: jest.fn().mockImplementation((transaction) => transaction),
        txPbToRawDataHex: jest.fn().mockReturnValue('refreshed-raw-data-hex'),
        txPbToTxID: jest.fn().mockReturnValue('0xrefreshed-tx-id'),
      },
    },
  });

  const createService = (tronWeb: ReturnType<typeof createTronWeb>) => {
    const tronWebFactory = {
      createClient: jest.fn().mockReturnValue(tronWeb),
    };

    return {
      service: new TransactionExpirationRefresherService({
        tronWebFactory: tronWebFactory as never,
      }),
      tronWebFactory,
    };
  };

  it('leaves valid transaction metadata unchanged', async () => {
    const referencedBlock = createBlock({
      number: 199_990,
      timestamp: now - 30_000,
      hashSegment: 'abcdef1234567890',
    });
    const currentBlock = createBlock({ number: 200_000, timestamp: now });
    const tronWeb = createTronWeb({ currentBlock, referencedBlock });
    const transaction = createTransaction({
      block: referencedBlock,
      expiration: now + 45_000,
    });
    const { service, tronWebFactory } = createService(tronWeb);

    const result = await service.ensureFreshMetadata({ scope, transaction });

    expect(result).toBe(transaction);
    expect(tronWebFactory.createClient).toHaveBeenCalledWith(scope);
    expect(transaction.raw_data.ref_block_bytes).toBe(
      getRefBlockBytes(199_990),
    );
    expect(transaction.raw_data.ref_block_hash).toBe('abcdef1234567890');
    expect(transaction.raw_data.expiration).toBe(now + 45_000);
    expect(transaction.raw_data_hex).toBe('original-raw-data-hex');
    expect(transaction.txID).toBe('original-tx-id');
    expect(tronWeb.trx.getBlockByNumber).toHaveBeenCalledWith(199_990);
    expect(tronWeb.utils.transaction.txJsonToPb).not.toHaveBeenCalled();
  });

  it('leaves valid current-block transaction metadata unchanged', async () => {
    const currentBlock = createBlock({
      number: 200_000,
      timestamp: now,
      hashSegment: '0011223344556677',
    });
    const tronWeb = createTronWeb({ currentBlock });
    const transaction = createTransaction({
      block: currentBlock,
      expiration: now + 45_000,
    });
    const { service, tronWebFactory } = createService(tronWeb);

    const result = await service.ensureFreshMetadata({ scope, transaction });

    expect(result).toBe(transaction);
    expect(tronWebFactory.createClient).toHaveBeenCalledWith(scope);
    expect(tronWeb.trx.getBlockByNumber).not.toHaveBeenCalled();
    expect(tronWeb.utils.transaction.txJsonToPb).not.toHaveBeenCalled();
  });

  it('deserializes a serialized transaction without modifying the payload', async () => {
    const currentBlock = createBlock({
      number: 200_000,
      timestamp: now,
      hashSegment: '0011223344556677',
    });
    const tronWeb = createTronWeb({ currentBlock });
    // Even a stale transaction must be returned exactly as received.
    const transaction = createTransaction({
      block: currentBlock,
      expiration: now - 1,
    });
    const rawDataHex = '1234567890abcdef';
    tronWeb.utils.deserializeTx.deserializeTransaction.mockReturnValue(
      transaction.raw_data,
    );
    const { service } = createService(tronWeb);

    const result = await service.deserializeTransaction({
      scope,
      type: 'TransferContract',
      rawDataHex,
    });

    expect(
      tronWeb.utils.deserializeTx.deserializeTransaction,
    ).toHaveBeenCalledWith('TransferContract', rawDataHex);
    expect(result.raw_data).toBe(transaction.raw_data);
    expect(result.raw_data_hex).toBe(rawDataHex);
    expect(result.txID).toBe(
      'b09dc9a32de2d32bc21052a2f185044607d11cc58966ba7d7b299fabb7dcbd12',
    );
    // Never refreshes: no block lookups, no transaction rebuild.
    expect(tronWeb.trx.getCurrentBlock).not.toHaveBeenCalled();
    expect(tronWeb.utils.transaction.txJsonToPb).not.toHaveBeenCalled();
    expect(tronWeb.utils.transaction.txPbToRawDataHex).not.toHaveBeenCalled();
    expect(tronWeb.utils.transaction.txPbToTxID).not.toHaveBeenCalled();
  });

  it('leaves transaction metadata unchanged when expiration is outside the three-block buffer', async () => {
    const currentBlock = createBlock({
      number: 200_000,
      timestamp: now,
      hashSegment: '0011223344556677',
    });
    const tronWeb = createTronWeb({ currentBlock });
    const transaction = createTransaction({
      block: currentBlock,
      expiration: now + 10_000,
    });
    const { service } = createService(tronWeb);

    const result = await service.ensureFreshMetadata({ scope, transaction });

    expect(result).toBe(transaction);
    expect(tronWeb.utils.transaction.txJsonToPb).not.toHaveBeenCalled();
  });

  it('refreshes transaction metadata before signing when expiration is close', async () => {
    const currentBlock = createBlock({
      number: 200_000,
      timestamp: now,
      hashSegment: '0011223344556677',
    });
    const tronWeb = createTronWeb({ currentBlock });
    const transaction = createTransaction({
      block: currentBlock,
      expiration: now + 5_000,
    });
    const originalTransaction = structuredClone(transaction);
    const { service } = createService(tronWeb);

    const result = await service.ensureFreshMetadata({ scope, transaction });

    expect(result).not.toBe(transaction);
    expect(result.raw_data).not.toBe(transaction.raw_data);
    expect(result.raw_data.ref_block_bytes).toBe(getRefBlockBytes(200_000));
    expect(result.raw_data.ref_block_hash).toBe('0011223344556677');
    expect(result.raw_data.expiration).toBe(now + 60_000);
    expect(result.raw_data.timestamp).toBe(now);
    expect(result.raw_data_hex).toBe('refreshed-raw-data-hex');
    expect(result.txID).toBe('refreshed-tx-id');
    expect(transaction.raw_data.ref_block_bytes).toBe(
      originalTransaction.raw_data.ref_block_bytes,
    );
    expect(transaction.raw_data.ref_block_hash).toBe(
      originalTransaction.raw_data.ref_block_hash,
    );
    expect(transaction.raw_data.expiration).toBe(
      originalTransaction.raw_data.expiration,
    );
    expect(transaction.raw_data.timestamp).toBe(
      originalTransaction.raw_data.timestamp,
    );
    expect(transaction.raw_data_hex).toBe(originalTransaction.raw_data_hex);
    expect(transaction.txID).toBe(originalTransaction.txID);
    expect(tronWeb.trx.getBlockByNumber).not.toHaveBeenCalled();
    const serializedTransaction =
      tronWeb.utils.transaction.txJsonToPb.mock.calls[0]?.[0];
    expect(serializedTransaction).not.toBe(transaction);
    expect(serializedTransaction.raw_data.ref_block_bytes).toBe(
      result.raw_data.ref_block_bytes,
    );
    expect(serializedTransaction.raw_data.ref_block_hash).toBe(
      result.raw_data.ref_block_hash,
    );
  });

  it('returns refreshed raw data when expiration is close', async () => {
    const currentBlock = createBlock({
      number: 200_000,
      timestamp: now,
      hashSegment: '0011223344556677',
    });
    const tronWeb = createTronWeb({ currentBlock });
    const transaction = createTransaction({
      block: currentBlock,
      expiration: now + 5_000,
    });
    const originalRawData = structuredClone(transaction.raw_data);
    const { service } = createService(tronWeb);

    const result = await service.ensureFreshRawData({
      scope,
      rawData: transaction.raw_data,
    });

    expect(result).not.toBe(transaction.raw_data);
    expect(result.ref_block_bytes).toBe(getRefBlockBytes(200_000));
    expect(result.ref_block_hash).toBe('0011223344556677');
    expect(result.expiration).toBe(now + 60_000);
    expect(result.timestamp).toBe(now);
    expect(transaction.raw_data.ref_block_bytes).toBe(
      originalRawData.ref_block_bytes,
    );
    expect(transaction.raw_data.ref_block_hash).toBe(
      originalRawData.ref_block_hash,
    );
    expect(transaction.raw_data.expiration).toBe(originalRawData.expiration);
    expect(transaction.raw_data.timestamp).toBe(originalRawData.timestamp);
    expect(tronWeb.utils.transaction.txJsonToPb).not.toHaveBeenCalled();
  });

  it('refreshes transaction metadata when the reference block hash does not match', async () => {
    const referencedBlock = createBlock({
      number: 199_990,
      timestamp: now - 30_000,
      hashSegment: 'abcdef1234567890',
    });
    const currentBlock = createBlock({
      number: 200_000,
      timestamp: now,
      hashSegment: '0011223344556677',
    });
    const tronWeb = createTronWeb({ currentBlock, referencedBlock });
    const transaction = createTransaction({
      block: referencedBlock,
      expiration: now + 45_000,
    });
    transaction.raw_data.ref_block_hash = 'badbadbadbadbad0';
    const originalTransaction = structuredClone(transaction);
    const { service } = createService(tronWeb);

    const result = await service.ensureFreshMetadata({ scope, transaction });

    expect(result).not.toBe(transaction);
    expect(result.raw_data.ref_block_bytes).toBe(getRefBlockBytes(200_000));
    expect(result.raw_data.ref_block_hash).toBe('0011223344556677');
    expect(result.raw_data.expiration).toBe(now + 60_000);
    expect(result.raw_data_hex).toBe('refreshed-raw-data-hex');
    expect(result.txID).toBe('refreshed-tx-id');
    expect(transaction.raw_data.ref_block_bytes).toBe(
      originalTransaction.raw_data.ref_block_bytes,
    );
    expect(transaction.raw_data.ref_block_hash).toBe(
      originalTransaction.raw_data.ref_block_hash,
    );
    expect(transaction.raw_data.expiration).toBe(
      originalTransaction.raw_data.expiration,
    );
    expect(transaction.raw_data.timestamp).toBe(
      originalTransaction.raw_data.timestamp,
    );
    expect(transaction.raw_data_hex).toBe(originalTransaction.raw_data_hex);
    expect(transaction.txID).toBe(originalTransaction.txID);
  });

  it('refreshes transaction metadata when expiration exceeds the maximum window', async () => {
    const currentBlock = createBlock({
      number: 200_000,
      timestamp: now,
      hashSegment: '0011223344556677',
    });
    const tronWeb = createTronWeb({ currentBlock });
    const transaction = createTransaction({
      block: currentBlock,
      expiration: now + 24 * 60 * 60 * 1000,
    });
    const { service } = createService(tronWeb);

    const result = await service.ensureFreshMetadata({ scope, transaction });

    expect(result).not.toBe(transaction);
    expect(result.raw_data.expiration).toBe(now + 60_000);
    expect(result.raw_data.ref_block_hash).toBe('0011223344556677');
  });

  it('refreshes transaction metadata when reference block bytes are outside the valid window', async () => {
    const currentBlock = createBlock({
      number: 10,
      timestamp: now,
      hashSegment: '0011223344556677',
    });
    const tronWeb = createTronWeb({ currentBlock });
    const transaction = createTransaction({
      block: currentBlock,
      expiration: now + 45_000,
    });
    transaction.raw_data.ref_block_bytes = 'ffff';
    const { service } = createService(tronWeb);

    const result = await service.ensureFreshMetadata({ scope, transaction });

    expect(result).not.toBe(transaction);
    expect(result.raw_data.ref_block_bytes).toBe(getRefBlockBytes(10));
    expect(tronWeb.trx.getBlockByNumber).not.toHaveBeenCalled();
  });

  it('refreshes transaction metadata when the referenced block cannot be fetched', async () => {
    const currentBlock = createBlock({
      number: 200_000,
      timestamp: now,
      hashSegment: '0011223344556677',
    });
    const referencedBlock = createBlock({
      number: 199_990,
      timestamp: now - 30_000,
      hashSegment: 'abcdef1234567890',
    });
    const tronWeb = createTronWeb({ currentBlock, referencedBlock });
    const transaction = createTransaction({
      block: referencedBlock,
      expiration: now + 45_000,
    });
    tronWeb.trx.getBlockByNumber.mockRejectedValue(
      new Error('block unavailable'),
    );
    const { service } = createService(tronWeb);

    const result = await service.ensureFreshMetadata({ scope, transaction });

    expect(result).not.toBe(transaction);
    expect(result.raw_data.ref_block_hash).toBe('0011223344556677');
  });

  it('throws a clear error when refreshed transaction fields cannot be rebuilt', async () => {
    const transaction = createTransaction({
      block: createBlock({ number: 199_990, timestamp: now - 30_000 }),
      expiration: now - 1,
    });
    const tronWeb = createTronWeb();
    tronWeb.utils.transaction.txJsonToPb.mockImplementation(() => {
      throw new Error('serialization failed');
    });
    const { service } = createService(tronWeb);

    await expect(
      service.ensureFreshMetadata({ scope, transaction }),
    ).rejects.toThrow(TRANSACTION_METADATA_REFRESH_ERROR);
  });

  it('throws a clear error when transaction metadata cannot be refreshed safely', async () => {
    const transaction = createTransaction({
      block: createBlock({ number: 199_990, timestamp: now - 30_000 }),
      expiration: now - 1,
    });
    const tronWeb = createTronWeb();
    tronWeb.trx.getCurrentBlock.mockRejectedValue(new Error('node offline'));
    const { service } = createService(tronWeb);

    await expect(
      service.ensureFreshMetadata({ scope, transaction }),
    ).rejects.toThrow(TRANSACTION_METADATA_REFRESH_ERROR);

    expect(tronWeb.trx.getBlockByNumber).not.toHaveBeenCalled();
    expect(tronWeb.utils.transaction.txJsonToPb).not.toHaveBeenCalled();
  });

  it('throws a clear error when ensureFreshRawData cannot fetch the current block', async () => {
    const transaction = createTransaction({
      block: createBlock({ number: 199_990, timestamp: now - 30_000 }),
      expiration: now - 1,
    });
    const tronWeb = createTronWeb();
    tronWeb.trx.getCurrentBlock.mockRejectedValue(new Error('node offline'));
    const { service } = createService(tronWeb);

    await expect(
      service.ensureFreshRawData({ scope, rawData: transaction.raw_data }),
    ).rejects.toThrow(TRANSACTION_METADATA_REFRESH_ERROR);
  });

  describe('isTransactionExpired', () => {
    it('returns false for a fresh, broadcastable transaction', async () => {
      const referencedBlock = createBlock({
        number: 199_990,
        timestamp: now - 30_000,
        hashSegment: 'abcdef1234567890',
      });
      const currentBlock = createBlock({ number: 200_000, timestamp: now });
      const tronWeb = createTronWeb({ currentBlock, referencedBlock });
      const transaction = createTransaction({
        block: referencedBlock,
        expiration: now + 45_000,
      });
      const { service } = createService(tronWeb);

      const expired = await service.isTransactionExpired({
        scope,
        rawData: transaction.raw_data,
      });

      expect(expired).toBe(false);
    });

    it('returns true when the expiration is in the past', async () => {
      const currentBlock = createBlock({ number: 200_000, timestamp: now });
      const tronWeb = createTronWeb({ currentBlock });
      const transaction = createTransaction({
        block: currentBlock,
        expiration: now - 1,
      });
      const { service } = createService(tronWeb);

      const expired = await service.isTransactionExpired({
        scope,
        rawData: transaction.raw_data,
      });

      expect(expired).toBe(true);
      // No need to fetch the referenced block once expiration is already stale.
      expect(tronWeb.trx.getBlockByNumber).not.toHaveBeenCalled();
    });

    it('returns true when the referenced block hash no longer matches', async () => {
      const referencedBlock = createBlock({
        number: 199_990,
        timestamp: now - 30_000,
        hashSegment: 'abcdef1234567890',
      });
      const currentBlock = createBlock({
        number: 200_000,
        timestamp: now,
        hashSegment: '0011223344556677',
      });
      const tronWeb = createTronWeb({ currentBlock, referencedBlock });
      const transaction = createTransaction({
        block: referencedBlock,
        expiration: now + 45_000,
      });
      transaction.raw_data.ref_block_hash = 'badbadbadbadbad0';
      const { service } = createService(tronWeb);

      const expired = await service.isTransactionExpired({
        scope,
        rawData: transaction.raw_data,
      });

      expect(expired).toBe(true);
    });

    it('returns true when the reference block bytes are outside the window', async () => {
      const currentBlock = createBlock({
        number: 10,
        timestamp: now,
        hashSegment: '0011223344556677',
      });
      const tronWeb = createTronWeb({ currentBlock });
      const transaction = createTransaction({
        block: currentBlock,
        expiration: now + 45_000,
      });
      transaction.raw_data.ref_block_bytes = 'ffff';
      const { service } = createService(tronWeb);

      const expired = await service.isTransactionExpired({
        scope,
        rawData: transaction.raw_data,
      });

      expect(expired).toBe(true);
      expect(tronWeb.trx.getBlockByNumber).not.toHaveBeenCalled();
    });

    it('throws when the current block cannot be fetched', async () => {
      const tronWeb = createTronWeb();
      tronWeb.trx.getCurrentBlock.mockRejectedValue(new Error('node offline'));
      const transaction = createTransaction({
        block: createBlock({ number: 199_990, timestamp: now - 30_000 }),
        expiration: now - 1,
      });
      const { service } = createService(tronWeb);

      await expect(
        service.isTransactionExpired({
          scope,
          rawData: transaction.raw_data,
        }),
      ).rejects.toThrow('node offline');
    });
  });
});
