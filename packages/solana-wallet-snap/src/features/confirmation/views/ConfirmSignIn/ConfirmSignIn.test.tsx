import { ActionHeader } from '@metamask/snap-networks-utils';
import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';

import { Network } from '../../../../core/constants/solana';
import type { Preferences } from '../../../../core/types/snap';
import { ConfirmSignIn } from './ConfirmSignIn';

describe('ConfirmSignIn', () => {
  it('renders the shared header with the sign-in title and description', () => {
    const serialized = JSON.stringify(
      ConfirmSignIn({
        params: { domain: 'example.com' },
        origin: 'https://example.com',
        account: {
          address: 'BLw3RweJmfbTapJRgnPRvd962YDjFYAnVGd1p5hmZ5tP',
        } as ExtendedKeyringAccount,
        accountDomain: null,
        scope: Network.Mainnet,
        preferences: { locale: 'en' } as Preferences,
        networkImage: null,
      }),
    );

    expect(serialized).toContain(
      JSON.stringify(
        ActionHeader({
          title: 'Sign-in request',
          subtitle:
            'A site wants you to sign in to prove you own this account.',
        }),
      ),
    );
  });
});
