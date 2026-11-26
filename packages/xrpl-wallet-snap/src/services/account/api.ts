import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';

import type { XrplDerivationPath } from '../wallet';

export type KeyringAccountId = string;

export type KeyringAccountState = {
  keyringAccounts: Record<KeyringAccountId, XrplKeyringAccount>;
};

/**
 * Shared extended keyring account with Xrpl's BIP-44 coin-type path.
 */
export type XrplKeyringAccount = ExtendedKeyringAccount & {
  derivationPath: XrplDerivationPath;
};

export const MultiChainMethod = {
  SignTransaction: 'signTransaction',
} as const;

export type MultiChainMethod =
  (typeof MultiChainMethod)[keyof typeof MultiChainMethod];
