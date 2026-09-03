import { KeyringRpcMethod } from '@metamask/keyring-api';
import { KeyringSnapRpcMethod } from '@metamask/keyring-api/v2';
import {
  createOriginPermissions,
  DEFAULT_PROD_ORIGINS,
} from '@metamask/snap-networks-utils';

import { METAMASK_ORIGIN } from './constants';

const metamaskMethods = [
  KeyringSnapRpcMethod.GetAccounts,
  KeyringSnapRpcMethod.GetAccount,
  KeyringSnapRpcMethod.CreateAccounts,
  KeyringSnapRpcMethod.DeleteAccount,
  KeyringSnapRpcMethod.GetAccountBalances,
  KeyringSnapRpcMethod.SubmitRequest,
  KeyringSnapRpcMethod.GetAccountTransactions,
  KeyringSnapRpcMethod.GetAccountAssets,
  KeyringSnapRpcMethod.ResolveAccountAddress,
  KeyringSnapRpcMethod.SetSelectedAccounts,
  KeyringSnapRpcMethod.ExportAccount,
  /**
   * Keyring API v1 method names, kept because consumers still call them.
   * Dropping them makes the client fail with an access restriction error on
   * initial load. The v2 dispatcher maps them onto `getAccountAssets` and
   * `getAccountTransactions`.
   */
  KeyringRpcMethod.ListAccountAssets,
  KeyringRpcMethod.ListAccountTransactions,
];

/**
 * Dapp origins are connected to the snap, but the snap does not expose any
 * keyring method to them. `dappMethods` is empty so every dapp call is rejected.
 */
export const originPermissions = createOriginPermissions({
  dappMethods: [],
  metamaskMethods,
  origins: DEFAULT_PROD_ORIGINS,
  metamaskOrigin: METAMASK_ORIGIN,
});
