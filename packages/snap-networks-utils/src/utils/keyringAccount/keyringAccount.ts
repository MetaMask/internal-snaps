import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';

/**
 * Keyring account fields snaps persist in addition to `@metamask/keyring-api`'s
 * `KeyringAccount`. `index` is stored so an account can be restored at a
 * previously used derivation index.
 */
export type KeyringAccountExtension = {
  entropySource: EntropySourceId;
  derivationPath: `m/${string}`;
  index: number;
};

/**
 * A `KeyringAccount` plus the derivation fields used by Solana, Tron, and Stellar.
 *
 * A snap may narrow `derivationPath` (for example Stellar's BIP-44 coin type).
 */
export type ExtendedKeyringAccount = KeyringAccount & KeyringAccountExtension;

/**
 * Converts an extended keyring account to the Keyring API shape (no extra fields).
 *
 * @param account - A keyring account, possibly with snap-specific fields.
 * @returns A strict keyring account.
 */
export function asStrictKeyringAccount(
  account: KeyringAccount,
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
