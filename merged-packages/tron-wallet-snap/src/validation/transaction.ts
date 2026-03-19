import { InvalidParamsError } from '@metamask/snaps-sdk';
import { assert, define, is } from '@metamask/superstruct';
import type { Types } from 'tronweb';

/**
 * Superstruct validator for Tron transaction raw data.
 *
 * A well-formed transaction has exactly one contract entry with a
 * non-empty parameter value. The Tron protocol only executes one
 * contract per transaction; the array in TronWeb's type definition
 * exists for forward-compatibility. Transactions with more than one
 * contract or a missing parameter are considered malformed.
 *
 * @see https://developers.tron.network/docs/tron-protocol-transaction
 */
export const TransactionRawDataStruct = define<Types.Transaction['raw_data']>(
  'TransactionRawData',
  (value) => {
    const rawData = value as Types.Transaction['raw_data'];

    if (!rawData?.contract || rawData.contract.length !== 1) {
      return 'must contain exactly one contract';
    }

    const [contractInteraction] = rawData.contract;
    if (!contractInteraction?.parameter?.value) {
      return 'contract must have a non-empty parameter value';
    }

    return true;
  },
);

/**
 * Checks whether the transaction structure is well-formed.
 *
 * @param rawData - The raw transaction data.
 * @returns True if the transaction has a valid single-contract structure.
 */
export function isTransactionWellFormed(
  rawData: Types.Transaction['raw_data'],
): boolean {
  return is(rawData, TransactionRawDataStruct);
}

/**
 * Asserts that the transaction raw data is well-formed, throwing if not.
 *
 * Use as a one-liner after deserializing an external transaction
 * to reject malformed payloads before they reach signing or confirmation.
 *
 * @param rawData - The raw transaction data.
 * @throws {InvalidParamsError} If the transaction is malformed.
 */
export function assertTransactionStructure(
  rawData: Types.Transaction['raw_data'],
): void {
  try {
    assert(rawData, TransactionRawDataStruct);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown validation error';
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw new InvalidParamsError(`Malformed transaction: ${message}`);
  }
}
