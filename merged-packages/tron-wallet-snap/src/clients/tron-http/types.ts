/* eslint-disable @typescript-eslint/naming-convention */
export type TronContract = {
  origin_address: string;
  contract_address: string;
  abi: {
    entrys: {
      type: string;
      name: string;
      inputs?: {
        name: string;
        type: string;
      }[];
      outputs?: {
        name: string;
        type: string;
      }[];
    }[];
  };
  bytecode: string;
  consume_user_resource_percent: number;
  name: string;
  origin_energy_limit: number;
  code_hash: string;
};

export type TriggerConstantContractRequest = {
  owner_address: string;
  contract_address: string;
  function_selector: string;
  parameter: string;
  visible?: boolean;
};

export type TriggerConstantContractResponse = {
  result: {
    result: boolean;
  };
  energy_used: number;
  constant_result: string[];
  transaction: {
    ret: {
      contractRet: string;
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

export type TRC20TokenMetadata = {
  name: string;
  symbol: string;
  decimals: number;
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

export type AccountResources = {
  freeNetLimit: number;
  NetLimit: number;
  TotalNetLimit: number;
  TotalNetWeight: number;
  tronPowerUsed: number;
  tronPowerLimit: number;
  EnergyLimit: number;
  TotalEnergyLimit: number;
  TotalEnergyWeight: number;
};
