/* eslint-disable @typescript-eslint/naming-convention */
import { InvalidParamsError } from '@metamask/snaps-sdk';
import { is } from '@metamask/superstruct';
import { Types } from 'tronweb';

import {
  assertTransactionStructure,
  TransactionRawDataStruct,
} from './transaction';

/**
 * Builds a well-formed raw transaction data object for testing.
 *
 * @param overrides - Partial overrides to apply.
 * @returns A mock raw data object.
 */
function buildRawData(
  overrides: Partial<Types.Transaction['raw_data']> = {},
): Types.Transaction['raw_data'] {
  return {
    contract: [
      {
        type: Types.ContractType.TransferContract,
        parameter: {
          type_url: 'type.googleapis.com/protocol.TransferContract',
          value: {
            owner_address: '41a614f803b6fd780986a42c78ec9c7f77e6ded13c',
            to_address: '4191bba2f3f6e1c4d5c8e8f5b6a7c8d9e0f1a2b3c4',
            amount: 1000000,
          },
        },
      },
    ],
    ref_block_bytes: '',
    ref_block_hash: '',
    expiration: 0,
    timestamp: 0,
    ...overrides,
  };
}

describe('TransactionRawDataStruct', () => {
  it('accepts a well-formed single-contract transaction', () => {
    expect(is(buildRawData(), TransactionRawDataStruct)).toBe(true);
  });

  it('rejects when contract array is empty', () => {
    expect(is(buildRawData({ contract: [] }), TransactionRawDataStruct)).toBe(
      false,
    );
  });

  it('rejects when there are multiple contracts', () => {
    const singleContract = buildRawData();
    const rawData = buildRawData({
      contract: [...singleContract.contract, ...singleContract.contract],
    });

    expect(is(rawData, TransactionRawDataStruct)).toBe(false);
  });

  it('rejects when contract parameter value is missing', () => {
    const rawData = buildRawData();
    (rawData.contract[0] as any).parameter.value = undefined;

    expect(is(rawData, TransactionRawDataStruct)).toBe(false);
  });

  it('rejects null input', () => {
    expect(is(null, TransactionRawDataStruct)).toBe(false);
  });
});

describe('assertTransactionStructure', () => {
  it('does not throw for a valid transaction', () => {
    expect(() => assertTransactionStructure(buildRawData())).not.toThrow();
  });

  it('throws InvalidParamsError for empty contracts', () => {
    expect(() =>
      assertTransactionStructure(buildRawData({ contract: [] })),
    ).toThrow(InvalidParamsError);
  });

  it('includes "Malformed transaction" in the error message', () => {
    expect(() =>
      assertTransactionStructure(buildRawData({ contract: [] })),
    ).toThrow(/Malformed transaction/u);
  });
});
