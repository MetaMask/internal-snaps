/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Full Node API response for GetTransactionInfoById
 * Returns detailed transaction info including block number and fees
 */
export type FullNodeTransactionInfo = {
  id?: string;
  fee?: number;
  blockNumber?: number;
  blockTimeStamp?: number;
  contractResult?: string[];
  contract_address?: string;
  receipt?: {
    energy_usage?: number;
    energy_fee?: number;
    origin_energy_usage?: number;
    energy_usage_total?: number;
    net_usage?: number;
    net_fee?: number;
    result?: string;
    energy_penalty_total?: number;
  };
  log?: {
    address: string;
    topics: string[];
    data: string;
  }[];
  result?: string;
  resMessage?: string;
  withdraw_amount?: number;
  unfreeze_amount?: number;
  internal_transactions?: {
    hash: string;
    caller_address: string;
    transferTo_address: string;
    callValueInfo: {
      callValue?: number;
      tokenId?: string;
    }[];
    note: string;
    rejected: boolean;
  }[];
  withdraw_expire_amount?: number;
  cancel_unfreezeV2_amount?: Record<string, number>;
};

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
 * Account resources
 *
 * @see https://developers.tron.network/reference/getaccountresource
 */
export type AccountResources = {
  freeNetUsed: number;
  freeNetLimit: number;
  NetLimit: number;
  TotalNetLimit: number;
  TotalNetWeight: number;
  tronPowerUsed: number;
  tronPowerLimit: number;
  EnergyUsed?: number;
  EnergyLimit?: number;
  TotalEnergyLimit: number;
  TotalEnergyWeight: number;
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
export type TriggerConstantContractResponse = {
  result: {
    result: boolean;
    message?: string;
  };
  energy_used: number;
  constant_result: string[];
  energy_penalty?: number;
  transaction: {
    ret: {
      ret: string;
    }[];
    visible: boolean;
    txID: string;
    raw_data: {
      contract: {
        parameter: {
          value: {
            data: string;
            owner_address: string;
            contract_address: string;
          };
          type_url: string;
        };
        type: string;
      }[];
      ref_block_bytes: string;
      ref_block_hash: string;
      expiration: number;
      timestamp: number;
    };
    raw_data_hex: string;
  };
};

/**
 * Contract energy sharing parameters from /wallet/getcontract endpoint.
 * We only extract the fields needed for fee calculation.
 *
 * @see https://developers.tron.network/reference/wallet-getcontract
 */
export type ContractInfo = {
  /**
   * Percentage of energy the USER/CALLER pays (0-100).
   */
  consume_user_resource_percent?: number;
  /**
   * Max energy the deployer will subsidize per transaction.
   */
  origin_energy_limit?: number;
};
