import { KeyringRpcMethod } from '@metamask/keyring-api';
import { KeyringSnapRpcMethod } from '@metamask/keyring-api/v2';
import {
  createOriginPermissions,
  DEFAULT_DEV_ORIGINS,
  DEFAULT_PROD_ORIGINS,
} from '@metamask/snap-networks-utils';

import { ClientRequestMethod } from './core/handlers/onClientRequest';
import { TestDappRpcRequestMethod } from './core/handlers/onRpcRequest/types';
import { ConfigProvider } from './core/services/config/ConfigProvider';

const config = new ConfigProvider().get();
const isDev = ['local', 'test'].includes(config.environment);

const dappMethods = [
  // Keyring v2 methods
  KeyringSnapRpcMethod.GetAccounts,
  KeyringSnapRpcMethod.GetAccount,
  KeyringSnapRpcMethod.DeleteAccount,
  KeyringSnapRpcMethod.GetAccountBalances,
  KeyringSnapRpcMethod.SubmitRequest,
  KeyringSnapRpcMethod.GetAccountTransactions,
  KeyringSnapRpcMethod.GetAccountAssets,
  KeyringSnapRpcMethod.SetSelectedAccounts,
  // Keyring v1 methods kept for backwards compatibility — callers using
  // old method names are still accepted by the permission layer.
  KeyringRpcMethod.ListAccounts,
  KeyringRpcMethod.CreateAccount,
  KeyringRpcMethod.FilterAccountChains,
  KeyringRpcMethod.DiscoverAccounts,
  KeyringRpcMethod.ListAccountTransactions,
  KeyringRpcMethod.ListAccountAssets,
  // Methods specific to the test dapp
  TestDappRpcRequestMethod.ListWebSockets,
  TestDappRpcRequestMethod.ListSubscriptions,
  TestDappRpcRequestMethod.TestOnStart,
  TestDappRpcRequestMethod.TestOnInstall,
  TestDappRpcRequestMethod.TestOnUpdate,
  TestDappRpcRequestMethod.SynchronizeAccounts,
  TestDappRpcRequestMethod.SetAccountSelected,
  TestDappRpcRequestMethod.ConfirmSend,
  TestDappRpcRequestMethod.SignRewardsMessage,
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
  ClientRequestMethod.SignAndSendTransactionWithoutConfirmation,
  ClientRequestMethod.SignProofOfOwnership,
  ClientRequestMethod.SignProofOfOwnershipBatch,
];

export const originPermissions = createOriginPermissions({
  dappMethods: isDev ? dappMethods : [],
  metamaskMethods,
  origins: isDev ? DEFAULT_DEV_ORIGINS : DEFAULT_PROD_ORIGINS,
});
