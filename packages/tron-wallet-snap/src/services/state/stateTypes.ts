import type { Transaction } from '@metamask/keyring-api';
import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';

import type { AssetEntity } from '../../entities/assets';

export type UnencryptedStateValue = {
  keyringAccounts: Record<string, ExtendedKeyringAccount>;
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
