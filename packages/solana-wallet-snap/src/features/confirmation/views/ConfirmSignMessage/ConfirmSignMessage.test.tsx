import { ActionHeader } from '@metamask/snap-networks-utils';
import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';

import { Network } from '../../../../core/constants/solana';
import { ConfirmSignMessage } from './ConfirmSignMessage';

describe('ConfirmSignMessage', () => {
  it('renders the shared header with the sign message title', () => {
    const serialized = JSON.stringify(
      ConfirmSignMessage({
        message: 'Hello',
        account: {
          address: 'BLw3RweJmfbTapJRgnPRvd962YDjFYAnVGd1p5hmZ5tP',
        } as ExtendedKeyringAccount,
        accountDomain: null,
        scope: Network.Mainnet,
        locale: 'en',
        networkImage: null,
        origin: 'https://example.com',
      }),
    );

    expect(serialized).toContain(
      JSON.stringify(ActionHeader({ title: 'Sign message' })),
    );
  });
});
