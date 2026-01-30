import { add0x } from '@metamask/utils';
import { TronWeb, type Types } from 'tronweb';

import type { SecurityScanPayload } from './types';

/**
 * Extracts scan parameters from the raw transaction data. This function
 * can be used as adapter between a Tron transaction and the payload
 * supported by SecurityAlertsApiClient.
 *
 * @param rawData - The raw transaction data.
 * @returns The extracted scan parameters.
 */
export const extractScanParametersFromTransactionData = (
  rawData: Types.Transaction['raw_data'],
): SecurityScanPayload | null => {
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
};
