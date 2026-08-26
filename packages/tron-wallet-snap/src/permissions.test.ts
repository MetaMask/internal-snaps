import { KeyringSnapRpcMethod } from '@metamask/keyring-api/v2';
import { DEFAULT_METAMASK_ORIGIN } from '@metamask/snap-networks-utils';

import { originPermissions } from './permissions';

// `ENVIRONMENT` differs between local runs (`test`) and CI (`production`), so
// these assertions hold for both permission shapes.
describe('originPermissions', () => {
  it('grants MetaMask the privileged keyring methods', () => {
    expect(
      originPermissions
        .get(DEFAULT_METAMASK_ORIGIN)
        ?.has(KeyringSnapRpcMethod.CreateAccounts),
    ).toBe(true);
  });

  it('never grants privileged methods to dapp origins', () => {
    const dappMethods = [...originPermissions.entries()]
      .filter(([origin]) => origin !== DEFAULT_METAMASK_ORIGIN)
      .flatMap(([, methods]) => [...methods]);

    expect(dappMethods).not.toContain(KeyringSnapRpcMethod.CreateAccounts);
    expect(dappMethods).not.toContain(KeyringSnapRpcMethod.ExportAccount);
  });
});
