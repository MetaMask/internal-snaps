import type { Transaction } from '@metamask/keyring-api';

import type { AssetEntity } from '../../entities/assets';
import type { TronKeyringAccount } from '../../entities/keyring-account';

export type AccountId = string;

export type UnencryptedStateValue = {
  keyringAccounts: Record<string, TronKeyringAccount>;
  assets: Record<AccountId, AssetEntity[]>;
  transactions: Record<AccountId, Transaction[]>;
  mapInterfaceNameToId: Record<string, string>;
};

export const DEFAULT_UNENCRYPTED_STATE: UnencryptedStateValue = {
  keyringAccounts: {},
  assets: {},
  transactions: {},
  mapInterfaceNameToId: {},
};
