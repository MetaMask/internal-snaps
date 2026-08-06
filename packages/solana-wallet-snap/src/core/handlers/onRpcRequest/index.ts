import type { JsonRpcRequest } from '@metamask/snaps-sdk';
import type { OnRpcRequestHandler } from '@metamask/snaps-sdk';

import {
  accountsSynchronizer,
  clientRequestHandler,
  eventEmitter,
  keyring,
} from '../../../snapContext';
import { ClientRequestMethod } from '../onClientRequest';
import { TestDappRpcRequestMethod } from './types';

export const handlers: Record<string, OnRpcRequestHandler> = {
  // Methods specific to the test dapp
  [TestDappRpcRequestMethod.ListWebSockets]: async () => {
    await eventEmitter.emitSync('onListWebSockets');
    return null;
  },
  [TestDappRpcRequestMethod.ListSubscriptions]: async () => {
    await eventEmitter.emitSync('onListSubscriptions');
    return null;
  },
  [TestDappRpcRequestMethod.TestOnStart]: async () => {
    await eventEmitter.emitSync('onStart');
    return null;
  },
  [TestDappRpcRequestMethod.TestOnInstall]: async () => {
    await eventEmitter.emitSync('onInstall');
    return null;
  },
  [TestDappRpcRequestMethod.TestOnUpdate]: async () => {
    await eventEmitter.emitSync('onUpdate');
    return null;
  },
  [TestDappRpcRequestMethod.SynchronizeAccounts]: async () => {
    await accountsSynchronizer.synchronize();
    return null;
  },
  [TestDappRpcRequestMethod.SetAccountSelected]: async ({
    request,
  }: {
    request: JsonRpcRequest;
  }) => {
    await keyring.setSelectedAccounts((request as any).params.accountIds);
    return null;
  },
  [TestDappRpcRequestMethod.ConfirmSend]: async ({
    request,
  }: {
    request: JsonRpcRequest;
  }) => {
    await clientRequestHandler.handle(request);
    return null;
  },
  [TestDappRpcRequestMethod.SignRewardsMessage]: async ({
    request,
  }: {
    request: JsonRpcRequest;
  }) => {
    return clientRequestHandler.handle({
      ...request,
      method: ClientRequestMethod.SignRewardsMessage,
    });
  },
};
