import type { KeyringAccount } from '@metamask/keyring-api';
import type { AssetsProvider } from '@metamask/snap-networks-utils';

/**
 * The account shape expected by `AssetsProvider.getAssets`.
 */
type GetAssetsAccount = Parameters<AssetsProvider['getAssets']>[0][number];

/**
 * Maps a keyring account to the internal account shape expected by the
 * AssetsController's `getAssets` action. The controller only reads
 * `id`, `scopes`, and `address`; the metadata is synthetic to satisfy
 * the type.
 *
 * @param account - The keyring account to map.
 * @returns The internal account for the controller fetch pipeline.
 */
export function toInternalAccount(account: KeyringAccount): GetAssetsAccount {
  return {
    id: account.id,
    address: account.address,
    type: account.type,
    scopes: account.scopes,
    options: account.options,
    methods: account.methods,
    metadata: {
      name: account.id,
      importTime: 0,
      keyring: {
        type: 'Snap Keyring',
      },
    },
  } as GetAssetsAccount;
}
