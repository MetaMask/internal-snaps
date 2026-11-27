import type { KeyringAccountState } from '../account/api';

export type UnencryptedStateValue = KeyringAccountState;

export const DEFAULT_UNENCRYPTED_STATE: UnencryptedStateValue = {
  keyringAccounts: {},
};
