/* eslint-disable @typescript-eslint/naming-convention */
export type TrongridApiResponse<T> = {
  data: T;
  success: boolean;
  meta: {
    at: number;
    page_size: number;
  };
};

export type TronAccount = {
  owner_permission: RawTronPermission;
  account_resource: RawTronAccountResource;
  active_permission: RawTronPermission[];
  address: string;
  create_time: number;
  latest_opration_time: number;
  frozenV2: RawTronFrozenV2[];
  unfrozenV2: RawTronUnfrozenV2[];
  balance: number;
  assetV2?: Record<string, string>[];
  trc20?: Record<string, string>[];
  latest_consume_free_time: number;
  votes: RawTronVote[];
  latest_withdraw_time: number;
  net_window_size: number;
  net_window_optimized: boolean;
};

export type RawTronPermission = {
  keys: RawTronKey[];
  threshold: number;
  permission_name: string;
  operations?: string;
  id?: number;
  type?: string;
};

export type RawTronKey = {
  address: string;
  weight: number;
};

export type RawTronAccountResource = {
  energy_window_optimized: boolean;
  energy_window_size: number;

  delegated_frozenV2_balance_for_energy?: number;
  delegated_frozenV2_balance_for_bandwidth?: number;
};

export type RawTronFrozenV2 = {
  amount?: number;
  type?: string;
};

export type RawTronUnfrozenV2 = {
  unfreeze_amount: number;
  unfreeze_expire_time: number;
};

export type RawTronVote = {
  vote_address: string;
  vote_count: number;
};

export type TransactionInfo = {
  ret: TransactionResult[];
  signature: string[];
  txID: string;
  net_usage: number;
  raw_data_hex: string;
  net_fee: number;
  energy_usage: number;
  blockNumber: number;
  block_timestamp: number;
  energy_fee: number;
  energy_usage_total: number;
  raw_data: RawTransactionData;
  internal_transactions: InternalTransaction[];
};

export type TransactionResult = {
  contractRet: string;
  fee: number;
};

export type RawTransactionData = {
  contract: ContractInfo[];
  ref_block_bytes: string;
  ref_block_hash: string;
  expiration: number;
  timestamp: number;
  fee_limit?: number;
};

// Specific contract types
export type TransferContractInfo = {
  parameter: TransferContractParameter;
  type: 'TransferContract';
};

export type TransferContractParameter = {
  value: TransferContractValue;
  type_url: 'type.googleapis.com/protocol.TransferContract';
};

export type TransferContractValue = {
  amount: number;
  owner_address: string;
  to_address: string;
};

export type TransferAssetContractInfo = {
  parameter: TransferAssetContractParameter;
  type: 'TransferAssetContract';
};

export type TransferAssetContractParameter = {
  value: TransferAssetContractValue;
  type_url: 'type.googleapis.com/protocol.TransferAssetContract';
};

export type TransferAssetContractValue = {
  amount: number;
  asset_name: string;
  owner_address: string;
  to_address: string;
};

// General contract type (catch-all)
export type GeneralContractInfo = {
  parameter: ContractParameter;
  type: string;
};

// Union type for all contract types
export type ContractInfo =
  | TransferContractInfo
  | TransferAssetContractInfo
  | GeneralContractInfo;

export type ContractParameter = {
  value: ContractValue;
  type_url: string;
};

export type ContractValue = {
  owner_address?: string;
  to_address?: string;
  unfreeze_balance?: number;
  votes?: ContractVote[];
  frozen_balance?: number;
  data?: string;
  contract_address?: string;
  call_value?: number;
};

export type ContractVote = {
  vote_address: string;
  vote_count: number;
};

export type InternalTransaction = {
  internal_tx_id: string;
  data: InternalTransactionData;
  to_address: string;
  from_address: string;
};

export type InternalTransactionData = {
  note: string;
  rejected: boolean;
  call_value?: {
    _: number;
  };
};

export type ContractTransactionInfo = {
  transaction_id: string;
  token_info: TokenInfo;
  block_timestamp: number;
  from: string;
  to: string;
  type: string;
  value: string;
};

export type TokenInfo = {
  symbol: string;
  address: string;
  decimals: number;
  name: string;
};

export type ChainParameter = {
  key: string;
  value?: number;
};

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
