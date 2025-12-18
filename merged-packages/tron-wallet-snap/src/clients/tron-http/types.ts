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
