import { KeyringRpcMethod } from '@metamask/keyring-api';
import { KeyringSnapRpcMethod } from '@metamask/keyring-api/v2';
import {
  createOriginPermissions,
  DEFAULT_DEV_ORIGINS,
  DEFAULT_PROD_ORIGINS,
} from '@metamask/snap-networks-utils';

import { ClientRequestMethod } from './handlers/clientRequest/types';
import { TestDappRpcRequestMethod } from './handlers/rpc/types';

// eslint-disable-next-line no-restricted-globals
const isDev = process.env.ENVIRONMENT !== 'production';

const dappMethods = [
  // Keyring v2 methods
  KeyringSnapRpcMethod.GetAccounts,
  KeyringSnapRpcMethod.GetAccount,
  KeyringSnapRpcMethod.DeleteAccount,
  KeyringSnapRpcMethod.GetAccountBalances,
  KeyringSnapRpcMethod.SubmitRequest,
  KeyringSnapRpcMethod.GetAccountTransactions,
  KeyringSnapRpcMethod.GetAccountAssets,
  // Keyring v1 methods kept for backwards compatibility — callers using
  // old method names are still accepted by the permission layer.
  KeyringRpcMethod.ListAccounts,
  KeyringRpcMethod.CreateAccount,
  KeyringRpcMethod.DiscoverAccounts,
  KeyringRpcMethod.ListAccountTransactions,
  KeyringRpcMethod.ListAccountAssets,
  // Test dapp specific methods
  TestDappRpcRequestMethod.ComputeFee,
];

const metamaskMethods = [
  // Keyring v2 methods
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
  // Keyring v1 methods kept for backwards compatibility — callers using
  // old method names are still accepted by the permission layer.
  KeyringRpcMethod.ListAccounts,
  KeyringRpcMethod.CreateAccount,
  KeyringRpcMethod.DiscoverAccounts,
  KeyringRpcMethod.ListAccountTransactions,
  KeyringRpcMethod.ListAccountAssets,
  // Client methods
  ClientRequestMethod.SignProofOfOwnershipBatch,
];

export const originPermissions = createOriginPermissions({
  dappMethods: isDev ? dappMethods : [],
  metamaskMethods,
  origins: isDev ? DEFAULT_DEV_ORIGINS : DEFAULT_PROD_ORIGINS,
});
