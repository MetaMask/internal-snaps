/* eslint-disable @typescript-eslint/naming-convention */

import type {
  ValidatedFullNodeTransactionInfo,
  ValidatedTriggerConstantContractResponse,
} from './structs';

/**
 * Full Node API response for GetTransactionInfoById
 * Returns detailed transaction info including block number and fees
 */
export type FullNodeTransactionInfo = ValidatedFullNodeTransactionInfo;

export type TRC10TokenInfo = {
  id: string;
  owner_address: string;
  name: string;
  abbr: string;
  total_supply: number;
  trx_num: number;
  // eslint-disable-next-line id-denylist
  num: number;
  precision: number;
  start_time: number;
  end_time: number;
  description: string;
  url: string;
};

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
export type NextMaintenanceTime = {
  /**
   * Unix timestamp in milliseconds of the next maintenance period
   */
  // eslint-disable-next-line id-denylist
  num: number;
};

/**
 * Chain parameter
 *
 * @see https://developers.tron.network/reference/wallet-getchainparameters
 */
export type ChainParameter = {
  key: string;
  value?: number;
};

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
export type ContractInfo = {
  /**
   * The address of the contract deployer.
   */
  origin_address?: string;
  /**
   * Percentage of energy the USER/CALLER pays (0-100).
   */
  consume_user_resource_percent?: number;
  /**
   * Max energy the deployer will subsidize per transaction.
   */
  origin_energy_limit?: number;
};
