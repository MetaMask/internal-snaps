import { ActionHeader } from '@metamask/snap-networks-utils';
import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';

import { Network } from '../../../../core/constants/solana';
import { ConfirmSignMessage } from './ConfirmSignMessage';

describe('ConfirmSignMessage', () => {
  it('labels the complete binary representation and shows a warning', () => {
    const serialized = JSON.stringify(
      ConfirmSignMessage({
        message: 'QQBC',
        isBinary: true,
        preview: '"A\\u0000B"',
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
    expect(serialized).toContain('Binary message (Base64)');
    expect(serialized).toContain('Text preview (escaped)');
    expect(serialized).toContain(
      'This message contains binary or hidden data.',
    );
    expect(serialized).toContain('QQBC');
  });

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
