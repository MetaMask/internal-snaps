import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';

import type { Network } from '../constants';

/**
 * A keyring account as stored by the snap, with its scopes narrowed to the
 * supported networks. The Keyring API receives it as a `KeyringAccount`.
 */
export type TronKeyringAccount = Omit<ExtendedKeyringAccount, 'scopes'> & {
  scopes: Network[];
};
