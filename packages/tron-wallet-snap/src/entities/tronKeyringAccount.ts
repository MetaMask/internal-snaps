import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';

import type { Network } from '../constants';

export type TronKeyringAccount = Omit<ExtendedKeyringAccount, 'scopes'> & {
  scopes: Network[];
};
