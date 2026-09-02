import type {
  OnUserInputHandler,
  OnKeyringRequestHandler,
  OnClientRequestHandler,
  OnCronjobHandler,
  OnAssetHistoricalPriceHandler,
  OnAssetsConversionHandler,
  OnAssetsLookupHandler,
  OnAssetsMarketDataHandler,
} from '@metamask/snaps-sdk';

import {
  keyringHandler,
  userInputHandler,
  clientRequestHandler,
  cronjobHandler,
} from './context';

export const onAssetsLookup: OnAssetsLookupHandler = async () => ({
  assets: {},
});

export const onAssetsConversion: OnAssetsConversionHandler = async () => ({
  conversionRates: {},
});

export const onAssetHistoricalPrice: OnAssetHistoricalPriceHandler =
  async () => null;

export const onAssetsMarketData: OnAssetsMarketDataHandler = async () => ({
  marketData: {},
});

export const onKeyringRequest: OnKeyringRequestHandler = async ({
  origin,
  request,
}) => keyringHandler.handle(origin, request);

export const onUserInput: OnUserInputHandler = async (params) =>
  userInputHandler.handle(params);

export const onClientRequest: OnClientRequestHandler = async ({ request }) =>
  clientRequestHandler.handle(request);

export const onCronjob: OnCronjobHandler = async ({ request }) =>
  cronjobHandler.handle(request);
