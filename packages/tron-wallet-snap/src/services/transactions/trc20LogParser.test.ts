import type { FungibleAssetMetadata } from '@metamask/snaps-sdk';

import {
  buildContractTransactionInfos,
  getReconstructedTransferAssetTypes,
  parseTransferLogs,
  TRC20_TRANSFER_EVENT_SIGNATURE,
  type ParsedTransferLog,
} from './trc20LogParser';
import { Network } from '../../constants';
import type { TokenCaipAssetType } from '../assets/types';

type EventLog = { address: string; topics: string[]; data: string };

const TX_ID =
  'aabbccddeeff00112233445566778899aabbccddeeff001122334455667788990';
const BLOCK_TIMESTAMP = 1763586027000;

// Real values taken from a confirmed swap transaction. The `from`/`to`/contract
// base58 addresses below are the canonical conversions of the hex topics.
const USDT_CONTRACT_HEX = 'a614f803b6fd780986a42c78ec9c7f77e6ded13c';
const USDT_CONTRACT_BASE58 = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const SENDER_HEX = 'a0a9d57ee9df8308bc29bcf881a569305260a0a5';
const SENDER_BASE58 = 'TQcia2H2TU3WrFk9sKtdK9qCfkW8XirfPQ';
const RECIPIENT_HEX = '18ff186cb1973d4b29700f2aac6b1eec9e55ffbd';
const RECIPIENT_BASE58 = 'TCFNp179Lg46D16zKoumd4Poa2WFFdtqYj';

/**
 * Left-pads a 20-byte hex address into a 32-byte event topic.
 *
 * @param addressHex - The 40-char hex address.
 * @returns The 64-char topic.
 */
const toTopic = (addressHex: string): string =>
  `000000000000000000000000${addressHex}`;

const transferLog = (
  contractHex: string,
  fromHex: string,
  toHex: string,
  data: string,
): EventLog => ({
  address: contractHex,
  topics: [TRC20_TRANSFER_EVENT_SIGNATURE, toTopic(fromHex), toTopic(toHex)],
  data,
});

describe('parseTransferLogs', () => {
  it('decodes a TRC20 transfer log into a structured transfer', () => {
    const log = [
      transferLog(
        USDT_CONTRACT_HEX,
        SENDER_HEX,
        RECIPIENT_HEX,
        '00000000000000000000000000000000000000000000000000000000002c8061',
      ),
    ];

    const result = parseTransferLogs(log, TX_ID, BLOCK_TIMESTAMP);

    expect(result).toStrictEqual([
      {
        transactionId: TX_ID,
        contractAddress: USDT_CONTRACT_BASE58,
        from: SENDER_BASE58,
        to: RECIPIENT_BASE58,
        value: '2916449',
        blockTimestamp: BLOCK_TIMESTAMP,
      },
    ]);
  });

  it('decodes large uint256 values without precision loss', () => {
    const log = [
      transferLog(
        USDT_CONTRACT_HEX,
        SENDER_HEX,
        RECIPIENT_HEX,
        '0000000000000000000000000000000000000000000000003fcbdf04566f1e10',
      ),
    ];

    const [transfer] = parseTransferLogs(log, TX_ID, BLOCK_TIMESTAMP);

    expect(transfer?.value).toBe('4597013054384709136');
  });

  it('returns multiple transfers from a multi-hop transaction', () => {
    const log = [
      transferLog(USDT_CONTRACT_HEX, SENDER_HEX, RECIPIENT_HEX, '0x01'),
      transferLog(USDT_CONTRACT_HEX, RECIPIENT_HEX, SENDER_HEX, '0x02'),
    ];

    const result = parseTransferLogs(log, TX_ID, BLOCK_TIMESTAMP);

    expect(result).toHaveLength(2);
    expect(result[0]?.value).toBe('1');
    expect(result[1]?.value).toBe('2');
  });

  it('tolerates a 0x prefix on the signature topic', () => {
    const log = [
      {
        address: USDT_CONTRACT_HEX,
        topics: [
          `0x${TRC20_TRANSFER_EVENT_SIGNATURE}`,
          toTopic(SENDER_HEX),
          toTopic(RECIPIENT_HEX),
        ],
        data: '0x2c8061',
      },
    ];

    const result = parseTransferLogs(log, TX_ID, BLOCK_TIMESTAMP);

    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe('2916449');
  });

  it('skips logs whose signature is not a Transfer event', () => {
    const log = [
      {
        address: USDT_CONTRACT_HEX,
        topics: [
          'cd60aa75dea3072fbc07ae6d7d856b5dc5f4eee88854f5b4abf7b680ef8bc50f',
          toTopic(SENDER_HEX),
          toTopic(RECIPIENT_HEX),
        ],
        data: '0x2c8061',
      },
    ];

    expect(parseTransferLogs(log, TX_ID, BLOCK_TIMESTAMP)).toStrictEqual([]);
  });

  it('skips Transfer logs missing the from/to topics', () => {
    const log = [
      {
        address: USDT_CONTRACT_HEX,
        topics: [TRC20_TRANSFER_EVENT_SIGNATURE],
        data: '0x2c8061',
      },
    ];

    expect(parseTransferLogs(log, TX_ID, BLOCK_TIMESTAMP)).toStrictEqual([]);
  });

  it('skips logs with empty data', () => {
    const log = [transferLog(USDT_CONTRACT_HEX, SENDER_HEX, RECIPIENT_HEX, '')];

    expect(parseTransferLogs(log, TX_ID, BLOCK_TIMESTAMP)).toStrictEqual([]);
  });

  it('returns an empty array when there are no logs', () => {
    expect(parseTransferLogs(undefined, TX_ID, BLOCK_TIMESTAMP)).toStrictEqual(
      [],
    );
    expect(parseTransferLogs([], TX_ID, BLOCK_TIMESTAMP)).toStrictEqual([]);
  });

  it('keeps only Transfer logs in a mixed log set', () => {
    const log = [
      {
        address: USDT_CONTRACT_HEX,
        topics: [
          'df4363408b2d9811d1e5c23efdb5bae0b7a68bd9de2de1cbae18a11be3e67ef5',
        ],
        data: '0x00',
      },
      transferLog(USDT_CONTRACT_HEX, SENDER_HEX, RECIPIENT_HEX, '0x2c8061'),
    ];

    const result = parseTransferLogs(log, TX_ID, BLOCK_TIMESTAMP);

    expect(result).toHaveLength(1);
    expect(result[0]?.contractAddress).toBe(USDT_CONTRACT_BASE58);
  });
});

const transfer = (
  contractAddress: string,
  value = '2916449',
): ParsedTransferLog => ({
  transactionId: TX_ID,
  contractAddress,
  from: SENDER_BASE58,
  to: RECIPIENT_BASE58,
  value,
  blockTimestamp: BLOCK_TIMESTAMP,
});

const usdtAssetType =
  `${Network.Mainnet}/trc20:${USDT_CONTRACT_BASE58}` as TokenCaipAssetType;

const usdtMetadata: FungibleAssetMetadata = {
  name: 'Tether USD',
  symbol: 'USDT',
  fungible: true,
  iconUrl: '',
  units: [{ name: 'Tether USD', symbol: 'USDT', decimals: 6 }],
};

describe('getReconstructedTransferAssetTypes', () => {
  it('returns the unique TRC20 asset types referenced by the transfers', () => {
    const otherContract = 'TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT';

    const result = getReconstructedTransferAssetTypes(
      [
        transfer(USDT_CONTRACT_BASE58),
        transfer(USDT_CONTRACT_BASE58),
        transfer(otherContract),
      ],
      Network.Mainnet,
    );

    expect(result).toStrictEqual([
      usdtAssetType,
      `${Network.Mainnet}/trc20:${otherContract}`,
    ]);
  });

  it('returns an empty array when there are no transfers', () => {
    expect(
      getReconstructedTransferAssetTypes([], Network.Mainnet),
    ).toStrictEqual([]);
  });
});

describe('buildContractTransactionInfos', () => {
  it('maps transfers to ContractTransactionInfo using resolved metadata', () => {
    const result = buildContractTransactionInfos(
      [transfer(USDT_CONTRACT_BASE58)],
      Network.Mainnet,
      { [usdtAssetType]: usdtMetadata },
    );

    expect(result).toStrictEqual([
      {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        transaction_id: TX_ID,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        token_info: {
          symbol: 'USDT',
          address: USDT_CONTRACT_BASE58,
          decimals: 6,
          name: 'Tether USD',
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        block_timestamp: BLOCK_TIMESTAMP,
        from: SENDER_BASE58,
        to: RECIPIENT_BASE58,
        type: 'Transfer',
        value: '2916449',
      },
    ]);
  });

  it('falls back to UNKNOWN symbol and default decimals when metadata is missing', () => {
    const result = buildContractTransactionInfos(
      [transfer(USDT_CONTRACT_BASE58)],
      Network.Mainnet,
      {},
    );

    expect(result[0]?.token_info).toStrictEqual({
      symbol: 'UNKNOWN',
      address: USDT_CONTRACT_BASE58,
      decimals: 9,
      name: 'UNKNOWN',
    });
  });

  it('falls back to defaults when metadata is null', () => {
    const result = buildContractTransactionInfos(
      [transfer(USDT_CONTRACT_BASE58)],
      Network.Mainnet,
      { [usdtAssetType]: null },
    );

    expect(result[0]?.token_info.symbol).toBe('UNKNOWN');
    expect(result[0]?.token_info.decimals).toBe(9);
  });
});
