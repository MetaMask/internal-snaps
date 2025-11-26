import { KeyringRpcMethod } from '@metamask/keyring-api';

import { ClientRequestMethod } from './handlers/clientRequest/types';
import { TestDappRpcRequestMethod } from './handlers/rpc/types';

const prodOrigins = ['https://portfolio.metamask.io'];

const isDev = false; // TODO: Change me when we have a config provider
const allowedOrigins = isDev ? ['http://localhost:3000'] : prodOrigins;

const dappPermissions = isDev
  ? new Set([
      // Keyring methods
      KeyringRpcMethod.ListAccounts,
      KeyringRpcMethod.GetAccount,
      KeyringRpcMethod.CreateAccount,
      KeyringRpcMethod.FilterAccountChains,
      KeyringRpcMethod.DeleteAccount,
      KeyringRpcMethod.DiscoverAccounts,
      KeyringRpcMethod.GetAccountBalances,
      KeyringRpcMethod.SubmitRequest,
      KeyringRpcMethod.ListAccountTransactions,
      KeyringRpcMethod.ListAccountAssets,
      // Test dapp specific methods
      TestDappRpcRequestMethod.ComputeFee,
    ])
  : new Set([]);

const metamaskPermissions = new Set([
  // Keyring methods
  KeyringRpcMethod.ListAccounts,
  KeyringRpcMethod.GetAccount,
  KeyringRpcMethod.CreateAccount,
  KeyringRpcMethod.DeleteAccount,
  KeyringRpcMethod.DiscoverAccounts,
  KeyringRpcMethod.GetAccountBalances,
  KeyringRpcMethod.SubmitRequest,
  KeyringRpcMethod.ListAccountTransactions,
  KeyringRpcMethod.ListAccountAssets,
  KeyringRpcMethod.ResolveAccountAddress,
  KeyringRpcMethod.SetSelectedAccounts,
  // Client request
  ClientRequestMethod.SignAndSendTransaction,
  ClientRequestMethod.ConfirmSend,
  ClientRequestMethod.ComputeFee,
  ClientRequestMethod.OnAddressInput,
  ClientRequestMethod.OnAmountInput,
  ClientRequestMethod.OnStakeAmountInput,
  ClientRequestMethod.ConfirmStake,
  ClientRequestMethod.OnUnstakeAmountInput,
  ClientRequestMethod.ConfirmUnstake,
]);

const metamask = 'metamask';

export const originPermissions = new Map<string, Set<string>>([]);

for (const origin of allowedOrigins) {
  originPermissions.set(origin, dappPermissions);
}
originPermissions.set(metamask, metamaskPermissions);
