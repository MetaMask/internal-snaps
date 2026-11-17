/* eslint-disable @typescript-eslint/naming-convention */
import type {
  ValidatedContractTransactionInfo,
  ValidatedRawTronUnfrozenV2,
  ValidatedTransactionInfo,
  ValidatedTronAccount,
} from './structs';

/**
 * Account and transaction entries come straight off the validated response, so
 * their types are the ones the structs prove — not a hand-written copy that
 * claims more than was checked.
 */
export type TronAccount = ValidatedTronAccount;

export type TransactionInfo = ValidatedTransactionInfo;

export type RawTronUnfrozenV2 = ValidatedRawTronUnfrozenV2;

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

export type ContractTransactionInfo = ValidatedContractTransactionInfo;

/**
 * TRC20 balance entry from the /v1/accounts/{address}/trc20/balance endpoint.
 * Each entry is a record mapping the contract address to its balance.
 */
export type Trc20Balance = Record<string, string>;
