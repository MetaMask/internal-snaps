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

import type { LogErrorFn } from '../errors/errors';

export type WithCatchAndThrowSnapError = <Response>(
  handler: () => Promise<Response>,
  logErrorOverride?: LogErrorFn,
) => Promise<Response>;

export type CreateSnapHandlersOptions = {
  keyring: OnKeyringRequestHandler;
  clientRequest: OnClientRequestHandler;
  cronjob: OnCronjobHandler;
  userInput: OnUserInputHandler;
  rpc?: OnRpcRequestHandler;
  withCatchAndThrowSnapError: WithCatchAndThrowSnapError;
  /**
   * Optional per-handler `logError` overrides, forwarded as the wrapper's
   * second argument. Omitted handlers use the logger bound in the wrapper.
   */
  logError?: {
    keyring?: LogErrorFn;
    clientRequest?: LogErrorFn;
    cronjob?: LogErrorFn;
    userInput?: LogErrorFn;
    rpc?: LogErrorFn;
  };
};

export type SnapHandlers = {
  onKeyringRequest: OnKeyringRequestHandler;
  onClientRequest: OnClientRequestHandler;
  onCronjob: OnCronjobHandler;
  onUserInput: OnUserInputHandler;
  onRpcRequest?: OnRpcRequestHandler;
  onAssetsLookup: OnAssetsLookupHandler;
  onAssetsConversion: OnAssetsConversionHandler;
  onAssetHistoricalPrice: OnAssetHistoricalPriceHandler;
  onAssetsMarketData: OnAssetsMarketDataHandler;
};

type CommonSnapHandlers = Omit<SnapHandlers, 'onRpcRequest'>;

/**
 * Creates the common network Snap entrypoint handlers.
 *
 * Each injected request handler is wrapped at the entrypoint with
 * `withCatchAndThrowSnapError`. Pass `logError` to forward a per-handler
 * logger override. Asset handlers return empty responses because
 * network Snaps currently provide assets through the Assets API instead.
 *
 * @param options - Handler implementations and the entrypoint error wrapper.
 * @returns Wrapped Snap entrypoint handlers and empty asset handlers.
 * @example
 * import { createSnapHandlers } from '@metamask/snap-networks-utils';
 *
 * import {
 *   clientRequestHandler,
 *   cronHandler,
 *   keyringHandler,
 *   rpcHandler,
 *   userInputHandler,
 * } from './context';
 * import { withCatchAndThrowSnapError } from './utils/errors';
 *
 * // Omit `rpc` when the Snap does not export `onRpcRequest`.
 * export const {
 *   onKeyringRequest,
 *   onClientRequest,
 *   onCronjob,
 *   onUserInput,
 *   onRpcRequest,
 *   onAssetsLookup,
 *   onAssetsConversion,
 *   onAssetHistoricalPrice,
 *   onAssetsMarketData,
 * } = createSnapHandlers({
 *   keyring: ({ origin, request }) => keyringHandler.handle(origin, request),
 *   clientRequest: ({ request }) => clientRequestHandler.handle(request),
 *   cronjob: ({ request }) => cronHandler.handle(request),
 *   userInput: (params) => userInputHandler.handle(params),
 *   rpc: ({ origin, request }) => rpcHandler.handle(origin, request),
 *   withCatchAndThrowSnapError,
 *   logError: {
 *     keyring: keyringLogger.error.bind(keyringLogger),
 *   },
 * });
 */
export function createSnapHandlers(
  options: CreateSnapHandlersOptions & { rpc: OnRpcRequestHandler },
): CommonSnapHandlers & { onRpcRequest: OnRpcRequestHandler };
export function createSnapHandlers(
  options: CreateSnapHandlersOptions & { rpc?: undefined },
): CommonSnapHandlers;
export function createSnapHandlers(
  options: CreateSnapHandlersOptions,
): SnapHandlers;
export function createSnapHandlers({
  keyring,
  clientRequest,
  cronjob,
  userInput,
  rpc,
  withCatchAndThrowSnapError,
  logError,
}: CreateSnapHandlersOptions): SnapHandlers {
  const handlers: CommonSnapHandlers = {
    onKeyringRequest: (args) =>
      withCatchAndThrowSnapError(() => keyring(args), logError?.keyring),
    onClientRequest: (args) =>
      withCatchAndThrowSnapError(
        () => clientRequest(args),
        logError?.clientRequest,
      ),
    onCronjob: (args) =>
      withCatchAndThrowSnapError(() => cronjob(args), logError?.cronjob),
    onUserInput: (args) =>
      withCatchAndThrowSnapError(() => userInput(args), logError?.userInput),
    onAssetsLookup: async () => ({ assets: {} }),
    onAssetsConversion: async () => ({ conversionRates: {} }),
    onAssetHistoricalPrice: async () => null,
    onAssetsMarketData: async () => ({ marketData: {} }),
  };

  return rpc
    ? {
        ...handlers,
        onRpcRequest: (args) =>
          withCatchAndThrowSnapError(() => rpc(args), logError?.rpc),
      }
    : handlers;
}
