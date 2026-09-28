import {
  noopAssetHandlers,
  wrapSnapHandlers,
} from '@metamask/snap-networks-utils';

import {
  keyringHandler,
  userInputHandler,
  clientRequestHandler,
  cronjobHandler,
} from './context';
import { KEYRING_HANDLER_LOGGER_PREFIX } from './handlers';
import { logger, withCatchAndThrowSnapError } from './utils';

const keyringLogger = logger.withPrefix(KEYRING_HANDLER_LOGGER_PREFIX);
const clientRequestLogger = logger.withPrefix('[👋 ClientRequestHandler]');

export const { onKeyringRequest, onUserInput, onClientRequest, onCronjob } =
  wrapSnapHandlers(
    withCatchAndThrowSnapError,
    {
      onKeyringRequest: async ({ origin, request }) =>
        keyringHandler.handle(origin, request),
      onUserInput: async (params) => userInputHandler.handle(params),
      onClientRequest: async ({ request }) =>
        clientRequestHandler.handle(request),
      onCronjob: async ({ request }) => cronjobHandler.handle(request),
    },
    {
      onKeyringRequest: keyringLogger.error.bind(keyringLogger),
      onClientRequest: clientRequestLogger.error.bind(clientRequestLogger),
    },
  );

export const {
  onAssetsLookup,
  onAssetsConversion,
  onAssetHistoricalPrice,
  onAssetsMarketData,
} = noopAssetHandlers;
