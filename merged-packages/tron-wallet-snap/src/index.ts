import type {
  OnActiveHandler,
  OnAssetHistoricalPriceHandler,
  OnAssetsConversionHandler,
  OnAssetsLookupHandler,
  OnAssetsMarketDataHandler,
  OnCronjobHandler,
  OnKeyringRequestHandler,
  OnRpcRequestHandler,
  OnUserInputHandler,
} from '@metamask/snaps-sdk';

import {
  assetsHandler,
  cronHandler,
  keyringHandler,
  lifecycleHandler,
  rpcHandler,
  userInputHandler,
} from './context';

/**
 * Register all handlers
 */

export const onAssetHistoricalPrice: OnAssetHistoricalPriceHandler = async (
  args,
) => assetsHandler.onAssetHistoricalPrice(args);

export const onAssetsConversion: OnAssetsConversionHandler = async (args) =>
  assetsHandler.onAssetsConversion(args);

export const onAssetsLookup: OnAssetsLookupHandler = async (args) =>
  assetsHandler.onAssetsLookup(args);

export const onAssetsMarketData: OnAssetsMarketDataHandler = async (args) =>
  assetsHandler.onAssetsMarketData(args);

export const onCronjob: OnCronjobHandler = async ({ request }) =>
  cronHandler.handle(request);

export const onKeyringRequest: OnKeyringRequestHandler = async ({
  origin,
  request,
}) => keyringHandler.handle(origin, request);

export const onRpcRequest: OnRpcRequestHandler = async ({ origin, request }) =>
  rpcHandler.handle(origin, request);

export const onUserInput: OnUserInputHandler = async (params) =>
  userInputHandler.handle(params);

export const onActive: OnActiveHandler = async () => {
  await lifecycleHandler.onActive();
};
