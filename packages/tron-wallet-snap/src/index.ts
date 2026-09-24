import {
  noopAssetHandlers,
  wrapSnapHandlers,
} from '@metamask/snap-networks-utils';

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

export const {
  onClientRequest,
  onCronjob,
  onKeyringRequest,
  onRpcRequest,
  onUserInput,
} = wrapSnapHandlers(withCatchAndThrowSnapError, {
  onClientRequest: async ({ request }) => clientRequestHandler.handle(request),
  onCronjob: async ({ request }) => cronHandler.handle(request),
  onKeyringRequest: async ({ origin, request }) =>
    keyringHandler.handle(origin, request),
  onRpcRequest: async ({ origin, request }) =>
    rpcHandler.handle(origin, request),
  onUserInput: async (params) => userInputHandler.handle(params),
});

export const {
  onAssetsLookup,
  onAssetsConversion,
  onAssetHistoricalPrice,
  onAssetsMarketData,
} = noopAssetHandlers;
