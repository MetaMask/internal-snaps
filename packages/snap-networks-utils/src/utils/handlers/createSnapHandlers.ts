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

export type WithCatchAndThrowSnapError = <Response>(
  handler: () => Promise<Response>,
) => Promise<Response>;

export type CreateSnapHandlersOptions = {
  keyring: OnKeyringRequestHandler;
  clientRequest: OnClientRequestHandler;
  cronjob: OnCronjobHandler;
  userInput: OnUserInputHandler;
  rpc?: OnRpcRequestHandler;
  withCatchAndThrowSnapError: WithCatchAndThrowSnapError;
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
 * `withCatchAndThrowSnapError`. Asset handlers return empty responses because
 * network Snaps currently provide assets through the Assets API instead.
 *
 * @param options - Handler implementations and the entrypoint error wrapper.
 * @returns Wrapped Snap entrypoint handlers and empty asset handlers.
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
}: CreateSnapHandlersOptions): SnapHandlers {
  const handlers: CommonSnapHandlers = {
    onKeyringRequest: (args) => withCatchAndThrowSnapError(() => keyring(args)),
    onClientRequest: (args) =>
      withCatchAndThrowSnapError(() => clientRequest(args)),
    onCronjob: (args) => withCatchAndThrowSnapError(() => cronjob(args)),
    onUserInput: (args) => withCatchAndThrowSnapError(() => userInput(args)),
    onAssetsLookup: async () => ({ assets: {} }),
    onAssetsConversion: async () => ({ conversionRates: {} }),
    onAssetHistoricalPrice: async () => null,
    onAssetsMarketData: async () => ({ marketData: {} }),
  };

  return rpc
    ? {
        ...handlers,
        onRpcRequest: (args) => withCatchAndThrowSnapError(() => rpc(args)),
      }
    : handlers;
}
