import type {
  OnClientRequestHandler,
  OnCronjobHandler,
  OnKeyringRequestHandler,
  OnRpcRequestHandler,
  OnUserInputHandler,
} from '@metamask/snaps-sdk';

import {
  clientRequestHandler,
  cronHandler,
  keyringHandler,
  rpcHandler,
  userInputHandler,
} from './context';
import { withCatchAndThrowSnapError } from './utils/errors';

/**
 * Register all handlers
 */

export const onClientRequest: OnClientRequestHandler = async ({ request }) =>
  withCatchAndThrowSnapError(async () => clientRequestHandler.handle(request));

export const onCronjob: OnCronjobHandler = async ({ request }) =>
  withCatchAndThrowSnapError(async () => cronHandler.handle(request));

export const onKeyringRequest: OnKeyringRequestHandler = async ({
  origin,
  request,
}) =>
  withCatchAndThrowSnapError(async () =>
    keyringHandler.handle(origin, request),
  );

export const onRpcRequest: OnRpcRequestHandler = async ({ origin, request }) =>
  withCatchAndThrowSnapError(async () => rpcHandler.handle(origin, request));

export const onUserInput: OnUserInputHandler = async (params) =>
  withCatchAndThrowSnapError(async () => userInputHandler.handle(params));
