import type {
  ValidatedChainParameter,
  ValidatedContractInfo,
  ValidatedFullNodeTransactionInfo,
  ValidatedNextMaintenanceTime,
  ValidatedTRC10TokenInfo,
  ValidatedTriggerConstantContractResponse,
} from './structs';

/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Full Node API response for GetTransactionInfoById
 * Returns detailed transaction info including block number and fees
 */
export type FullNodeTransactionInfo = ValidatedFullNodeTransactionInfo;

export type TRC10TokenInfo = ValidatedTRC10TokenInfo;

export type TRC10TokenMetadata = {
  name: string;
  symbol: string;
  decimals: number;
};

/**
 * Next maintenance time response
 *
 * @see https://developers.tron.network/reference/getnextmaintenancetime
 */
export type NextMaintenanceTime = ValidatedNextMaintenanceTime;

/**
 * Chain parameter
 *
 * @see https://developers.tron.network/reference/wallet-getchainparameters
 */
export type ChainParameter = ValidatedChainParameter;

/**
 * Request parameters for TriggerConstantContract
 *
 * @see https://developers.tron.network/reference/triggerconstantcontract
 */
export type TriggerConstantContractRequest = {
  owner_address: string;
  contract_address: string;
  data: string;
  call_value?: number;
  token_id?: number;
  visible?: boolean; // Default to true
  call_token_id?: number;
  call_token_value?: number;
};

/**
 * Response from TriggerConstantContract
 *
 * @see https://developers.tron.network/reference/triggerconstantcontract
 */
export type TriggerConstantContractResponse =
  ValidatedTriggerConstantContractResponse;

/**
 * Contract energy sharing parameters from /wallet/getcontract endpoint.
 * We only extract the fields needed for fee calculation.
 *
 * @see https://developers.tron.network/reference/wallet-getcontract
 */
export type ContractInfo = ValidatedContractInfo;
