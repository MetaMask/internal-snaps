import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';

/**
 * We need to store the index of the KeyringAccount in the state because
 * we want to be able to restore any account with a previously used index.
 */
export type TronKeyringAccount = KeyringAccount & {
  entropySource: EntropySourceId;
  derivationPath: `m/${string}`;
  index: number;
};

/**
 * Converts a Tron keyring account to its stricter form (required by the Keyring API).
 *
 * @param account - A Tron keyring account.
 * @returns A strict keyring account (with no additional fields).
 */
export function asStrictKeyringAccount(
  account: TronKeyringAccount,
): KeyringAccount {
  const { id, address, type, options, methods, scopes } = account;
  return {
    id,
    address,
    type,
    options,
    methods,
    scopes,
  };
}
