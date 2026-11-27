import type { KeyringAccountState } from '../account/api';
import type { AssetMetadataState } from '../asset-metadata/api';
import type { TransactionStateValue } from '../transaction/api';

export type UnencryptedStateValue = KeyringAccountState &
  AssetMetadataState &
  TransactionStateValue;

export const DEFAULT_UNENCRYPTED_STATE: UnencryptedStateValue = {
  keyringAccounts: {},
  assets: {},
  transactions: {},
  lastScanTokens: {},
};
