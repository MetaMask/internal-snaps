import type {
  OnAssetHistoricalPriceHandler,
  OnAssetsConversionHandler,
  OnAssetsLookupHandler,
  OnAssetsMarketDataHandler,
  OnClientRequestHandler,
  OnKeyringRequestHandler,
} from '@metamask/snaps-sdk';

import { noopAssetHandlers, wrapSnapHandlers } from './wrapSnapHandlers';
import type { WithCatchAndThrowSnapError } from './wrapSnapHandlers';

describe('wrapSnapHandlers', () => {
  const keyringArgs = {
    origin: 'https://example.com',
    originMetadata: null,
    request: { jsonrpc: '2.0', id: 1, method: 'keyring' },
  } as Parameters<OnKeyringRequestHandler>[0];
  const clientRequestArgs = {
    request: { jsonrpc: '2.0', id: 2, method: 'client' },
  } as Parameters<OnClientRequestHandler>[0];

  function setup(): {
    wrapper: jest.Mock;
    withCatchAndThrowSnapError: WithCatchAndThrowSnapError;
  } {
    const wrapper = jest.fn();
    const withCatchAndThrowSnapError: WithCatchAndThrowSnapError = async (
      handler,
      logErrorOverride,
    ) => {
      wrapper(logErrorOverride);
      return handler();
    };
    return { wrapper, withCatchAndThrowSnapError };
  }

  it('wraps and delegates each given handler under the same key', async () => {
    const { wrapper, withCatchAndThrowSnapError } = setup();
    const keyring = jest.fn().mockResolvedValue('keyring-result');
    const clientRequest = jest.fn().mockResolvedValue('client-result');

    const handlers = wrapSnapHandlers(withCatchAndThrowSnapError, {
      onKeyringRequest: keyring,
      onClientRequest: clientRequest,
    });

    expect(Object.keys(handlers)).toStrictEqual([
      'onKeyringRequest',
      'onClientRequest',
    ]);
    expect(await handlers.onKeyringRequest(keyringArgs)).toBe('keyring-result');
    expect(await handlers.onClientRequest(clientRequestArgs)).toBe(
      'client-result',
    );
    expect(keyring).toHaveBeenCalledWith(keyringArgs);
    expect(clientRequest).toHaveBeenCalledWith(clientRequestArgs);
    expect(wrapper).toHaveBeenCalledTimes(2);
  });

  it('types handler args from the SDK entrypoint type', async () => {
    const { withCatchAndThrowSnapError } = setup();

    const { onKeyringRequest } = wrapSnapHandlers(withCatchAndThrowSnapError, {
      onKeyringRequest: async ({ origin, request }) =>
        `${origin}:${request.method}`,
    });

    expect(await onKeyringRequest(keyringArgs)).toBe(
      'https://example.com:keyring',
    );
  });

  it('forwards a per-handler logError override', async () => {
    const { wrapper, withCatchAndThrowSnapError } = setup();
    const keyringLogError = jest.fn();

    const handlers = wrapSnapHandlers(
      withCatchAndThrowSnapError,
      {
        onKeyringRequest: jest.fn().mockResolvedValue(null),
        onClientRequest: jest.fn().mockResolvedValue(null),
      },
      { onKeyringRequest: keyringLogError },
    );
    await handlers.onKeyringRequest(keyringArgs);
    await handlers.onClientRequest(clientRequestArgs);

    expect(wrapper).toHaveBeenNthCalledWith(1, keyringLogError);
    expect(wrapper).toHaveBeenNthCalledWith(2, undefined);
  });

  it('surfaces errors through the injected wrapper', async () => {
    const error = new Error('Handler failed');
    const wrappedError = new Error('Wrapped handler error');
    let caughtError: unknown;
    const withCatchAndThrowSnapError: WithCatchAndThrowSnapError = async (
      handler,
    ) => {
      try {
        return await handler();
      } catch (handlerError) {
        caughtError = handlerError;
        throw wrappedError;
      }
    };

    const { onClientRequest } = wrapSnapHandlers(withCatchAndThrowSnapError, {
      onClientRequest: jest.fn().mockRejectedValue(error),
    });

    await expect(onClientRequest(clientRequestArgs)).rejects.toThrow(
      wrappedError,
    );
    expect(caughtError).toBe(error);
  });
});

describe('noopAssetHandlers', () => {
  it('returns empty asset responses', async () => {
    expect(
      await noopAssetHandlers.onAssetsLookup(
        {} as Parameters<OnAssetsLookupHandler>[0],
      ),
    ).toStrictEqual({ assets: {} });
    expect(
      await noopAssetHandlers.onAssetsConversion(
        {} as Parameters<OnAssetsConversionHandler>[0],
      ),
    ).toStrictEqual({ conversionRates: {} });
    expect(
      await noopAssetHandlers.onAssetHistoricalPrice(
        {} as Parameters<OnAssetHistoricalPriceHandler>[0],
      ),
    ).toBeNull();
    expect(
      await noopAssetHandlers.onAssetsMarketData(
        {} as Parameters<OnAssetsMarketDataHandler>[0],
      ),
    ).toStrictEqual({ marketData: {} });
  });
});
