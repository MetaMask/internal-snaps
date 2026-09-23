import { KeyringRpcMethod } from '@metamask/keyring-api';
import { handleKeyringRequest } from '@metamask/keyring-snap-sdk/v2';
import {
  noopAssetHandlers,
  validateOrigin,
  wrapSnapHandlers,
} from '@metamask/snap-networks-utils';
import { MethodNotFoundError } from '@metamask/snaps-sdk';
import type { Json } from '@metamask/snaps-sdk';
import { assert, enums } from '@metamask/superstruct';
import BigNumber from 'bignumber.js';

import { handlers as onCronjobHandlers } from './core/handlers/onCronjob';
import { ScheduleBackgroundEventMethod } from './core/handlers/onCronjob/backgroundEvents/ScheduleBackgroundEventMethod';
import { CronjobMethod } from './core/handlers/onCronjob/cronjobs/CronjobMethod';
import { onNameLookupHandler } from './core/handlers/onNameLookup/onNameLookup';
import { onProtocolRequest as onProtocolRequestHandler } from './core/handlers/onProtocolRequest/onProtocolRequest';
import { handlers as onRpcRequestHandlers } from './core/handlers/onRpcRequest';
import { withCatchAndThrowSnapError } from './core/utils/errors';
import logger from './core/utils/logger';
import { eventHandlers as confirmSignInEvents } from './features/confirmation/views/ConfirmSignIn/events';
import { eventHandlers as confirmSignMessageEvents } from './features/confirmation/views/ConfirmSignMessage/events';
import { eventHandlers as confirmSignAndSendTransactionEvents } from './features/confirmation/views/ConfirmTransactionRequest/events';
import { originPermissions } from './permissions';
import { installPolyfills } from './polyfills';
import snapContext, {
  clientRequestHandler,
  eventEmitter,
  keyring,
} from './snapContext';

installPolyfills();

// Lowest precision we ever go for: MicroLamports represented in Sol amount
BigNumber.config({ EXPONENTIAL_AT: 16 });

export const {
  onRpcRequest,
  onKeyringRequest,
  onUserInput,
  onCronjob,
  onProtocolRequest,
  onClientRequest,
  onWebSocketEvent,
  onStart,
  onUpdate,
  onInstall,
  onActive,
  onInactive,
  onNameLookup,
} = wrapSnapHandlers(withCatchAndThrowSnapError, {
  /**
   * Handle incoming JSON-RPC requests, sent through `wallet_invokeSnap`.
   *
   * @param args - The request handler args as object.
   * @param args.origin - The origin of the request, e.g., the website that
   * invoked the snap.
   * @param args.originMetadata - Metadata reported by the requesting origin.
   * @param args.request - A validated JSON-RPC request object.
   * @returns A promise that resolves to the result of the RPC request.
   * @throws If the request method is not valid for this snap.
   */
  onRpcRequest: async ({ origin, originMetadata, request }) => {
    logger.log('[🔄 onRpcRequest]', request.method, request);

    const { method } = request;

    validateOrigin(origin, method, originPermissions);

    const handler = onRpcRequestHandlers[method];

    if (!handler) {
      throw new MethodNotFoundError(
        `RpcRequest method ${method} not found. Available methods: ${Object.keys(
          onRpcRequestHandlers,
        ).toString()}`,
      ) as unknown as Error;
    }

    const result = await handler({ origin, originMetadata, request });

    return result ?? null;
  },

  /**
   * Handle incoming keyring requests.
   *
   * @param args - The request handler args as object.
   * @param args.origin - The origin of the request, e.g., the website that
   * invoked the snap.
   * @param args.request - A validated keyring request object.
   * @returns A promise that resolves to a JSON object.
   * @throws If the request method is not valid for this snap.
   */
  onKeyringRequest: async ({ origin, request }) => {
    logger.log('[🔑 onKeyringRequest]', request.method, request);

    validateOrigin(origin, request.method, originPermissions);

    // This is a temporal fix to prevent the swap/bridge functionality breaking
    // TODO: Remove this once changes in bridge-status-controller are in place
    if (
      request.method === KeyringRpcMethod.SubmitRequest &&
      request.params &&
      !('origin' in request.params)
    ) {
      (request.params as Record<string, Json>).origin = 'https://metamask.io';
    }

    const result = await handleKeyringRequest(keyring, request);

    return result ?? null;
  },

  /**
   * Handle user events requests.
   *
   * @param args - The request handler args as object.
   * @param args.id - The interface id associated with the event.
   * @param args.event - The event object.
   * @param args.context - The context object.
   * @returns A promise that resolves to a JSON object.
   * @throws If the request method is not valid for this snap.
   */
  onUserInput: async ({ id, event, context }) => {
    logger.log('[👇 onUserInput]', id, event);

    // Using the name of the component, route it to the correct handler
    if (!event.name) {
      return;
    }

    const uiEventHandlers: Record<string, (...args: any) => Promise<void>> = {
      ...confirmSignAndSendTransactionEvents,
      ...confirmSignMessageEvents,
      ...confirmSignInEvents,
    };

    const handler = uiEventHandlers[event.name];

    if (!handler) {
      return;
    }

    await handler({ id, event, context, snapContext });
  },

  /**
   * Handle incoming cronjob requests.
   *
   * @param args - The request handler args as object.
   * @param args.request - A validated cronjob request object.
   * @returns A promise that resolves to a JSON object.
   * @throws If the request method is not valid for this snap.
   * @see https://docs.metamask.io/snaps/reference/entry-points/#oncronjob
   */
  onCronjob: async ({ request }) => {
    const _logger = logger.withPrefix('[⏱️ onCronjob]');

    _logger.log(request.method, request);

    const { method } = request;
    const validMethods = [
      ...Object.values(CronjobMethod),
      ...Object.values(ScheduleBackgroundEventMethod),
    ];

    assert(method, enums(validMethods as [string, ...string[]]));

    _logger.log('Running cronjob', { method });

    const handler =
      onCronjobHandlers[method as CronjobMethod | ScheduleBackgroundEventMethod];

    if (!handler) {
      throw new MethodNotFoundError(
        `Cronjob / ScheduleBackgroundEvent method ${method} not found. Available methods: ${validMethods.toString()}`,
      ) as unknown as Error;
    }

    const result = await handler({ request });

    return result ?? null;
  },

  onProtocolRequest: async (params) =>
    (await onProtocolRequestHandler(params)) ?? null,

  onClientRequest: async ({ request }) =>
    (await clientRequestHandler.handle(request)) ?? null,

  onWebSocketEvent: async ({ event }) => {
    await eventEmitter.emitSync('onWebSocketEvent', event);
  },

  /*
   * Lifecycle handlers
   */

  onStart: async () => {
    await eventEmitter.emitSync('onStart');
  },

  onUpdate: async () => {
    await eventEmitter.emitSync('onUpdate');
  },

  onInstall: async () => {
    await eventEmitter.emitSync('onInstall');
  },

  onActive: async () => {
    await eventEmitter.emitSync('onActive');
  },

  onInactive: async () => {
    await eventEmitter.emitSync('onInactive');
  },

  onNameLookup: async (request) => (await onNameLookupHandler(request)) ?? null,
});

export const {
  onAssetsLookup,
  onAssetsConversion,
  onAssetHistoricalPrice,
  onAssetsMarketData,
} = noopAssetHandlers;
