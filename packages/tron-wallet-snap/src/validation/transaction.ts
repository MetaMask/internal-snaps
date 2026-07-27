import { InvalidParamsError } from '@metamask/snaps-sdk';
import { assert, define, is } from '@metamask/superstruct';
import type { BigNumber } from 'bignumber.js';
import { TronWeb, Types } from 'tronweb';

import { ZERO } from '../constants';
import { sunToTrx } from '../utils/conversion';

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

/**
 * Returns the native TRX value transferred by a transaction.
 *
 * TRX is carried in `amount` for native transfers and in `call_value` for
 * smart-contract calls. Other contract amounts represent tokens or protocol
 * values and must not be counted as TRX.
 *
 * @param rawData - The raw transaction data.
 * @returns The transferred TRX amount.
 */
export function getTransactionTrxValue(
  rawData: Types.Transaction['raw_data'],
): BigNumber {
  const contract = rawData.contract[0];
  const value = contract?.parameter?.value;

  if (!contract || !value) {
    return ZERO;
  }

  if (contract.type === Types.ContractType.TransferContract) {
    return sunToTrx('amount' in value ? (value.amount ?? 0) : 0);
  }

  if (contract.type === Types.ContractType.TriggerSmartContract) {
    return sunToTrx('call_value' in value ? (value.call_value ?? 0) : 0);
  }

  return ZERO;
}

/**
 * Extracts the base58 owner address from raw transaction data.
 *
 * @param rawData - The raw transaction data.
 * @returns The owner address in base58 format, or null if not found / invalid.
 */
export function extractTransactionOwnerAddress(
  rawData: Types.Transaction['raw_data'],
): string | null {
  const contract = rawData.contract[0];
  const ownerAddressHex = contract?.parameter?.value?.owner_address;

  if (!ownerAddressHex) {
    return null;
  }

  try {
    return TronWeb.address.fromHex(ownerAddressHex);
  } catch {
    return null;
  }
}

/**
 * Verifies that the `owner_address` extracted from the transaction's `raw_data` matches the persisted account address
 *
 * @param rawData - The raw transaction data.
 * @param signerAddress - The address derived from the private key used to sign.
 */
export function assertTransactionSignerConsistency(
  rawData: Types.Transaction['raw_data'],
  signerAddress: string,
): void {
  const transactionOwnerAddress = extractTransactionOwnerAddress(rawData);

  if (!transactionOwnerAddress) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw new InvalidParamsError(
      `'Transaction is missing owner_address - cannot verify sender`,
    );
  }

  if (transactionOwnerAddress !== signerAddress) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw new InvalidParamsError(
      `Transaction owner_address (${transactionOwnerAddress}) does not match derived signer address (${signerAddress})`,
    );
  }
}
