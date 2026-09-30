import { add0x } from '@metamask/utils';
import { TronWeb, Types as TronwebTypes } from 'tronweb';

import type { SecurityScanPayload } from './types';

/**
 * Contract types for which the Security Alerts API can produce reliable
 * simulation results.
 */
const SUPPORTED_CONTRACT_TYPES: TronwebTypes.ContractType[] = [
  TronwebTypes.ContractType.TransferContract,
  TronwebTypes.ContractType.CreateSmartContract,
  TronwebTypes.ContractType.TriggerSmartContract,
];

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
  return SUPPORTED_CONTRACT_TYPES.includes(contractInteraction.type);
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
): SecurityScanPayload | null {
  const contractParam = rawData.contract[0]?.parameter.value;

  if (!contractParam) {
    return null;
  }

  const from = TronWeb.address.fromHex(contractParam.owner_address);

  let to = '';
  if ('contract_address' in contractParam && contractParam.contract_address) {
    to = TronWeb.address.fromHex(contractParam.contract_address);
  } else if ('to_address' in contractParam && contractParam.to_address) {
    to = TronWeb.address.fromHex(contractParam.to_address);
  }

  let value = 0;
  if ('call_value' in contractParam && contractParam.call_value) {
    value = contractParam.call_value;
  } else if ('amount' in contractParam && contractParam.amount) {
    value = contractParam.amount;
  }

  let data: string | null = null;
  if ('data' in contractParam && contractParam.data) {
    data = add0x(contractParam.data);
  }

  return { from, to, data, value };
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
