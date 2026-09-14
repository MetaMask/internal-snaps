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
 * Converts an extended snap account to the Keyring API shape.
 *
 * Snaps persist `entropySource`, `derivationPath`, and `index` on the account
 * object. The Keyring API must not receive those fields, so this copies only
 * the six `KeyringAccount` properties.
 *
 * @param account - A snap keyring account with derivation fields.
 * @returns A `KeyringAccount` with no extra properties.
 */
export function asStrictKeyringAccount(
  account: ExtendedKeyringAccount,
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
