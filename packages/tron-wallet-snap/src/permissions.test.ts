import { KeyringSnapRpcMethod } from '@metamask/keyring-api/v2';
import {
  DEFAULT_DEV_ORIGINS,
  DEFAULT_PROD_ORIGINS,
} from '@metamask/snap-networks-utils';

import { TestDappRpcRequestMethod } from './handlers/rpc/types';
import { originPermissions } from './permissions';

describe('originPermissions', () => {
  it('allows localhost dapp methods and MetaMask keyring methods in test', () => {
    expect(
      originPermissions
        .get(DEFAULT_DEV_ORIGINS[0])
        ?.has(TestDappRpcRequestMethod.ComputeFee),
    ).toBe(true);
    expect(
      originPermissions
        .get('metamask')
        ?.has(KeyringSnapRpcMethod.CreateAccounts),
    ).toBe(true);
    expect(originPermissions.has(DEFAULT_PROD_ORIGINS[0])).toBe(false);
  });
});
