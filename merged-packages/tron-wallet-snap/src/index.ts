import type {
  OnAssetHistoricalPriceHandler,
  OnAssetsConversionHandler,
  OnAssetsLookupHandler,
  OnAssetsMarketDataHandler,
  OnClientRequestHandler,
  OnCronjobHandler,
  OnKeyringRequestHandler,
  OnRpcRequestHandler,
  OnUserInputHandler,
} from '@metamask/snaps-sdk';
import type { JsonRpcRequest } from '@metamask/utils';

import {
  assetsHandler,
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

export const onAssetHistoricalPrice: OnAssetHistoricalPriceHandler = async (
  args,
) =>
  withCatchAndThrowSnapError(async () =>
    assetsHandler.onAssetHistoricalPrice(args),
  );

export const onAssetsConversion: OnAssetsConversionHandler = async (args) =>
  withCatchAndThrowSnapError(async () =>
    assetsHandler.onAssetsConversion(args),
  );

export const onAssetsLookup: OnAssetsLookupHandler = async (args) =>
  withCatchAndThrowSnapError(async () => assetsHandler.onAssetsLookup(args));

export const onAssetsMarketData: OnAssetsMarketDataHandler = async (args) =>
  withCatchAndThrowSnapError(async () =>
    assetsHandler.onAssetsMarketData(args),
  );

export const onClientRequest: OnClientRequestHandler = async ({ request }) =>
  withCatchAndThrowSnapError(async () => clientRequestHandler.handle(request));

export const onCronjob: OnCronjobHandler = async ({ request }) =>
  withCatchAndThrowSnapError(async () =>
    cronHandler.handle(request as JsonRpcRequest),
  );

export const onKeyringRequest: OnKeyringRequestHandler = async ({
  origin,
  request,
}) =>
  withCatchAndThrowSnapError(async () =>
    keyringHandler.handle(origin, request as JsonRpcRequest),
  );

export const onRpcRequest: OnRpcRequestHandler = async ({ origin, request }) =>
  withCatchAndThrowSnapError(async () =>
    rpcHandler.handle(origin, request as JsonRpcRequest),
  );

export const onUserInput: OnUserInputHandler = async (params) =>
  withCatchAndThrowSnapError(async () => userInputHandler.handle(params));
