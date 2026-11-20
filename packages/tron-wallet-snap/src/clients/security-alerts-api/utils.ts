import { add0x, hasProperty } from '@metamask/utils';
import { TronWeb, Types as TronwebTypes } from 'tronweb';

import type { SecurityScanPayload } from './types';

/**
 * Contract types for which the Security Alerts API can produce reliable
 * simulation results.
 */
const SUPPORTED_CONTRACT_TYPES: ReadonlySet<TronwebTypes.ContractType> =
  new Set([
    TronwebTypes.ContractType.TransferContract,
    TronwebTypes.ContractType.CreateSmartContract,
    TronwebTypes.ContractType.TriggerSmartContract,
  ]);

/**
 * Reads a numeric property from a contract parameter value.
 *
 * TronWeb types the parameter value as a union of contract-specific shapes, so
 * individual fields are only readable once their presence is checked.
 *
 * @param value - The contract parameter value.
 * @param property - The property to read.
 * @returns The property value when it is a number, otherwise `undefined`.
 */
function readNumberProperty(
  value: object,
  property: string,
): number | undefined {
  const found = hasProperty(value, property)
    ? (value as Record<string, unknown>)[property]
    : undefined;

  return typeof found === 'number' ? found : undefined;
}

/**
 * Reads a non-empty string property from a contract parameter value.
 *
 * @param value - The contract parameter value.
 * @param property - The property to read.
 * @returns The property value when it is a non-empty string, otherwise
 * `undefined`.
 */
function readStringProperty(
  value: object,
  property: string,
): string | undefined {
  const found = hasProperty(value, property)
    ? (value as Record<string, unknown>)[property]
    : undefined;

  return typeof found === 'string' && found.length > 0 ? found : undefined;
}

/**
 * Checks whether the first contract type in the transaction is supported
 * by the Security Alerts API simulation.
 *
 * Only the first contract in `raw_data.contract` is considered because
 * the Tron protocol currently only executes one contract per
 * transaction (see {@link extractScanParametersFromTransactionData}).
 *
 * @param rawData - The raw transaction data.
 * @returns True if the contract type is supported for simulation.
 */
export function isContractTypeSupported(
  rawData: TronwebTypes.Transaction['raw_data'],
): boolean {
  const [contractInteraction] = rawData.contract;
  if (!contractInteraction) {
    return false;
  }
  return SUPPORTED_CONTRACT_TYPES.has(contractInteraction.type);
}

/**
 * Extracts scan parameters from the raw transaction data. This function
 * can be used as adapter between a Tron transaction and the payload
 * supported by the Security Alerts API scan request.
 *
 * Only the first contract in `raw_data.contract` is used because
 * the Tron protocol currently only executes one contract per
 * transaction. The array exists in TronWeb's type definition for
 * forward-compatibility, but any transaction with more than one
 * contract is considered malformed.
 *
 * @see https://developers.tron.network/docs/tron-protocol-transaction
 * @param rawData - The raw transaction data.
 * @returns The extracted scan parameters.
 */
export function extractScanParametersFromTransactionData(
  rawData: TronwebTypes.Transaction['raw_data'],
): SecurityScanPayload {
  const contractParam = rawData.contract[0]?.parameter.value;

  if (!contractParam) {
    throw new Error('Could not extract scan parameters from transaction.');
  }

  const contractCallValue = readNumberProperty(contractParam, 'call_value');
  const transferAmount = readNumberProperty(contractParam, 'amount');

  let callValue = 0;
  if (contractCallValue) {
    callValue = contractCallValue;
  } else if (transferAmount) {
    callValue = transferAmount;
  }

  const payload: SecurityScanPayload = {
    from: TronWeb.address.fromHex(contractParam.owner_address),
    value: `0x${callValue.toString(16)}`,
  };

  const toAddress =
    readStringProperty(contractParam, 'contract_address') ??
    readStringProperty(contractParam, 'to_address');

  if (toAddress) {
    payload.to = TronWeb.address.fromHex(toAddress);
  }

  const data = readStringProperty(contractParam, 'data');

  if (data) {
    payload.data = add0x(data);
  }

  return payload;
}

/**
 * Builds a minimal `Transaction['raw_data']` suitable for security scanning
 * from high-level send parameters. This is the inverse of
 * {@link extractScanParametersFromTransactionData}.
 *
 * @param params - The send parameters.
 * @param params.from - The sender address (base58).
 * @param params.to - The recipient or contract address (base58).
 * @param params.amount - The amount in sun (TRX value for the transaction).
 * @param params.data - Optional contract call data.
 * @param params.contractType - The Tron contract type to build.
 * @returns A minimal raw transaction data object.
 */
export function buildTransactionRawData({
  from,
  to,
  amount,
  data,
  contractType,
}: {
  from: string;
  to: string;
  amount: number;
  data?: string | null;
  contractType: TronwebTypes.ContractType;
}): TronwebTypes.Transaction['raw_data'] {
  const ownerAddressHex = TronWeb.address.toHex(from);

  if (contractType === TronwebTypes.ContractType.TriggerSmartContract) {
    return {
      contract: [
        {
          type: TronwebTypes.ContractType.TriggerSmartContract,
          parameter: {
            value: {
              owner_address: ownerAddressHex,
              contract_address: TronWeb.address.toHex(to),
              ...(data ? { data } : {}),
              ...(amount ? { call_value: amount } : {}),
            },
            type_url: 'type.googleapis.com/protocol.TriggerSmartContract',
          },
        },
      ],
      ref_block_bytes: '',
      ref_block_hash: '',
      expiration: 0,
      timestamp: 0,
    };
  }

  return {
    contract: [
      {
        type: TronwebTypes.ContractType.TransferContract,
        parameter: {
          value: {
            owner_address: ownerAddressHex,
            to_address: TronWeb.address.toHex(to),
            amount,
          },
          type_url: 'type.googleapis.com/protocol.TransferContract',
        },
      },
    ],
    ref_block_bytes: '',
    ref_block_hash: '',
    expiration: 0,
    timestamp: 0,
  };
}
