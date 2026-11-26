import { XRPL_WALLET_SNAP_MESSENGER_NAMESPACE } from './core-messenger';

describe('XRPL_WALLET_SNAP_MESSENGER_NAMESPACE', () => {
  it('uses the XrplWalletSnap namespace', () => {
    expect(XRPL_WALLET_SNAP_MESSENGER_NAMESPACE).toBe('XrplWalletSnap');
  });
});
