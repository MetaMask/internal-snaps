import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';

export type KeyringAccountId = string;

export type KeyringAccountState = {
  keyringAccounts: Record<KeyringAccountId, StellarKeyringAccount>;
};

/** Stellar BIP44 derivation path (e.g. `m/44'/148'` or `m/44'/148'/0'`). */
export type StellarDerivationPath = `m/44'/148'/${string}'` | `m/44'/148'`;

/**
 * Shared extended keyring account with Stellar's BIP-44 coin-type path.
 */
export type StellarKeyringAccount = ExtendedKeyringAccount & {
  derivationPath: StellarDerivationPath;
};
