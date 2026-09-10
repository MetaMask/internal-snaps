import type { Transaction } from '@metamask/keyring-api';

import type { AssetEntity } from '../../entities/assets';
import type { TronKeyringAccount } from '../../entities/keyring-account';

export type UnencryptedStateValue = {
  keyringAccounts: Record<string, TronKeyringAccount>;
  assets: Record<string, AssetEntity[]>;
  transactions: Record<string, Transaction[]>;
  mapInterfaceNameToId: Record<string, string>;
};

export const DEFAULT_UNENCRYPTED_STATE: UnencryptedStateValue = {
  keyringAccounts: {},
  assets: {},
  transactions: {},
  mapInterfaceNameToId: {},
};
