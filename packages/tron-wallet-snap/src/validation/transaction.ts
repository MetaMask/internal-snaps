import { InvalidParamsError } from '@metamask/snaps-sdk';
import {
  assert,
  create,
  define,
  is,
  min,
  number,
  optional,
  string,
  type,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import type { BigNumber } from 'bignumber.js';
import { TronWeb, Types as TronwebTypes } from 'tronweb';

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
export const TransactionRawDataStruct = define<
  TronwebTypes.Transaction['raw_data']
>('TransactionRawData', (value) => {
  const rawData = value as TronwebTypes.Transaction['raw_data'];

  if (rawData?.contract?.length !== 1) {
    return 'must contain exactly one contract';
  }

  const [contractInteraction] = rawData.contract;
  if (!contractInteraction?.parameter?.value) {
    return 'contract must have a non-empty parameter value';
  }

  return true;
});

/**
 * The fields of a contract parameter value that the Snap reads, across every
 * contract type. TronWeb types the value as a union of contract types, so
 * reading a field that only some of them carry needs this narrowing.
 */
export const ContractParameterValueStruct = type({
  owner_address: string(),
  to_address: optional(string()),
  contract_address: optional(string()),
  data: optional(string()),
  amount: optional(min(number(), 0)),
  call_value: optional(min(number(), 0)),
});

export type ContractParameterValue = Infer<typeof ContractParameterValueStruct>;

/**
 * The parameter value of a `TriggerSmartContract` contract.
 */
export const TriggerSmartContractValueStruct = type({
  owner_address: string(),
  contract_address: string(),
  data: optional(string()),
  call_value: optional(min(number(), 0)),
  token_id: optional(number()),
  call_token_id: optional(number()),
  call_token_value: optional(number()),
});

/**
 * Returns the validated parameter value of the transaction's single contract.
 *
 * @param rawData - The raw transaction data.
 * @returns The contract parameter value, or null when the transaction has no contract.
 */
export function getContractParameterValue(
  rawData: TronwebTypes.Transaction['raw_data'],
): ContractParameterValue | null {
  const value = rawData.contract[0]?.parameter?.value;
  return value ? create(value, ContractParameterValueStruct) : null;
}

/**
 * Checks whether the transaction structure is well-formed.
 *
 * @param rawData - The raw transaction data.
 * @returns True if the transaction has a valid single-contract structure.
 */
export function isTransactionWellFormed(
  rawData: TronwebTypes.Transaction['raw_data'],
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
  rawData: unknown,
): asserts rawData is TronwebTypes.Transaction['raw_data'] {
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
  rawData: TronwebTypes.Transaction['raw_data'],
): BigNumber {
  const contract = rawData.contract[0];
  const value = getContractParameterValue(rawData);

  if (!contract || !value) {
    return ZERO;
  }

  if (contract.type === TronwebTypes.ContractType.TransferContract) {
    return sunToTrx(value.amount ?? 0);
  }

  if (contract.type === TronwebTypes.ContractType.TriggerSmartContract) {
    return sunToTrx(value.call_value ?? 0);
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
  rawData: TronwebTypes.Transaction['raw_data'],
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
  rawData: TronwebTypes.Transaction['raw_data'],
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
