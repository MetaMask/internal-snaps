import type {
  OnActiveHandler,
  OnAssetHistoricalPriceHandler,
  OnAssetsConversionHandler,
  OnAssetsLookupHandler,
  OnAssetsMarketDataHandler,
  OnClientRequestHandler,
  OnCronjobHandler,
  OnHomePageHandler,
  OnInactiveHandler,
  OnInstallHandler,
  OnKeyringRequestHandler,
  OnNameLookupHandler,
  OnProtocolRequestHandler,
  OnRpcRequestHandler,
  OnSettingsPageHandler,
  OnSignatureHandler,
  OnStartHandler,
  OnTransactionHandler,
  OnUpdateHandler,
  OnUserInputHandler,
  OnWebSocketEventHandler,
} from '@metamask/snaps-sdk';

import type { LogErrorFn } from '../errors/errors';

export type WithCatchAndThrowSnapError = <Response>(
  handler: () => Promise<Response>,
  logErrorOverride?: LogErrorFn,
) => Promise<Response>;

/**
 * Snap entrypoint names mapped to their SDK handler types.
 */
export type SnapHandlers = {
  onActive: OnActiveHandler;
  onAssetHistoricalPrice: OnAssetHistoricalPriceHandler;
  onAssetsConversion: OnAssetsConversionHandler;
  onAssetsLookup: OnAssetsLookupHandler;
  onAssetsMarketData: OnAssetsMarketDataHandler;
  onClientRequest: OnClientRequestHandler;
  onCronjob: OnCronjobHandler;
  onHomePage: OnHomePageHandler;
  onInactive: OnInactiveHandler;
  onInstall: OnInstallHandler;
  onKeyringRequest: OnKeyringRequestHandler;
  onNameLookup: OnNameLookupHandler;
  onProtocolRequest: OnProtocolRequestHandler;
  onRpcRequest: OnRpcRequestHandler;
  onSettingsPage: OnSettingsPageHandler;
  onSignature: OnSignatureHandler;
  onStart: OnStartHandler;
  onTransaction: OnTransactionHandler;
  onUpdate: OnUpdateHandler;
  onUserInput: OnUserInputHandler;
  onWebSocketEvent: OnWebSocketEventHandler;
};

/**
 * Wraps each given Snap entrypoint handler with `withCatchAndThrowSnapError`.
 *
 * @param withCatchAndThrowSnapError - The Snap's bound error wrapper.
 * @param handlers - Entrypoint handlers, keyed by their Snap export name.
 * @param logError - Optional per-handler `logError` overrides, forwarded as
 * the wrapper's second argument. Omitted handlers use the logger bound in the
 * wrapper.
 * @returns The wrapped handlers, under the same keys.
 * @example
 * import {
 *   noopAssetHandlers,
 *   wrapSnapHandlers,
 * } from '@metamask/snap-networks-utils';
 *
 * import { clientRequestHandler, keyringHandler, keyringLogger } from './context';
 * import { withCatchAndThrowSnapError } from './utils/errors';
 *
 * export const { onKeyringRequest, onClientRequest } = wrapSnapHandlers(
 *   withCatchAndThrowSnapError,
 *   {
 *     onKeyringRequest: ({ origin, request }) =>
 *       keyringHandler.handle(origin, request),
 *     onClientRequest: ({ request }) => clientRequestHandler.handle(request),
 *   },
 *   { onKeyringRequest: keyringLogger.error.bind(keyringLogger) },
 * );
 *
 * export const {
 *   onAssetsLookup,
 *   onAssetsConversion,
 *   onAssetHistoricalPrice,
 *   onAssetsMarketData,
 * } = noopAssetHandlers;
 */
export function wrapSnapHandlers<HandlerName extends keyof SnapHandlers>(
  withCatchAndThrowSnapError: WithCatchAndThrowSnapError,
  handlers: { [Name in HandlerName]: SnapHandlers[Name] },
  logError: Partial<Record<HandlerName, LogErrorFn>> = {},
): Pick<SnapHandlers, HandlerName> {
  return Object.fromEntries(
    Object.entries(handlers).map(([name, handler]) => [
      name,
      async (args: unknown): Promise<unknown> =>
        withCatchAndThrowSnapError(
          async () => (handler as (args: unknown) => Promise<unknown>)(args),
          logError[name as HandlerName],
        ),
    ]),
  ) as Pick<SnapHandlers, HandlerName>;
}
 * No-op asset handlers that network Snaps must export to keep the
 * `endowment:assets` permission, since assets are provided through the
 * Assets API instead.
 */
export const noopAssetHandlers: Pick<
  SnapHandlers,
  | 'onAssetsLookup'
  | 'onAssetsConversion'
  | 'onAssetHistoricalPrice'
  | 'onAssetsMarketData'
> = {
  onAssetsLookup: async () => ({ assets: {} }),
  onAssetsConversion: async () => ({ conversionRates: {} }),
  onAssetHistoricalPrice: async () => null,
  onAssetsMarketData: async () => ({ marketData: {} }),
};
