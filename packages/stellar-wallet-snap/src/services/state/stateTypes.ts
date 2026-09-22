import type { KeyringAccountState } from '../account/api';
import type { AssetMetadataState } from '../asset-metadata/api';
import type { OnChainAccountState } from '../on-chain-account/api';
import type { TransactionStateValue } from '../transaction/TransactionRepository';

export type UnencryptedStateValue = KeyringAccountState &
  AssetMetadataState &
  TransactionStateValue &
  OnChainAccountState;

export const DEFAULT_UNENCRYPTED_STATE: UnencryptedStateValue = {
  keyringAccounts: {},
  assets: {},
  transactions: {},
  lastScanTokens: {},
  onChainAccounts: {},
};
