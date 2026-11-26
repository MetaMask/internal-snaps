import type { Infer } from '@metamask/superstruct';

import type {
  ContractInfoStruct,
  ContractValueStruct,
  ContractVoteStruct,
  InternalTransactionCallValueStruct,
  InternalTransactionDataStruct,
  InternalTransactionStruct,
  RawTransactionDataStruct,
  RawTronUnfrozenV2Struct,
  TokenInfoStruct,
  Trc20BalanceStruct,
  TransactionResultStruct,
  ValidatedContractTransactionInfo,
  ValidatedTransactionInfo,
  ValidatedTronAccount,
} from './structs';

/* eslint-disable @typescript-eslint/naming-convention */
export type TronAccount = ValidatedTronAccount;

export type RawTronUnfrozenV2 = Infer<typeof RawTronUnfrozenV2Struct>;

export type TransactionInfo = ValidatedTransactionInfo;

export type TransactionResult = Infer<typeof TransactionResultStruct>;

export type RawTransactionData = Infer<typeof RawTransactionDataStruct>;

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

export type ContractInfo = Infer<typeof ContractInfoStruct>;

export type ContractValue = Infer<typeof ContractValueStruct>;

export type ContractVote = Infer<typeof ContractVoteStruct>;

export type InternalTransaction = Infer<typeof InternalTransactionStruct>;

export type InternalTransactionData = Infer<
  typeof InternalTransactionDataStruct
>;

export type InternalTransactionCallValue = Infer<
  typeof InternalTransactionCallValueStruct
>;

export type ContractTransactionInfo = ValidatedContractTransactionInfo;

export type TokenInfo = Infer<typeof TokenInfoStruct>;

/**
 * TRC20 balance entry from the /v1/accounts/{address}/trc20/balance endpoint.
 * Each entry is a record mapping the contract address to its balance.
 */
export type Trc20Balance = Infer<typeof Trc20BalanceStruct>;
