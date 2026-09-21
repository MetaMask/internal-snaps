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

import { createSnapHandlers } from './createSnapHandlers';
import type { WithCatchAndThrowSnapError } from './createSnapHandlers';

describe('createSnapHandlers', () => {
  const keyringArgs = {
    origin: 'https://example.com',
    originMetadata: null,
    request: { jsonrpc: '2.0', id: 1, method: 'keyring' },
  } as Parameters<OnKeyringRequestHandler>[0];
  const clientRequestArgs = {
    request: { jsonrpc: '2.0', id: 2, method: 'client' },
  } as Parameters<OnClientRequestHandler>[0];
  const cronjobArgs = {
    request: { jsonrpc: '2.0', id: 3, method: 'cronjob' },
  } as Parameters<OnCronjobHandler>[0];
  const userInputArgs = {
    id: 'interface-id',
    event: { type: 'ButtonClickEvent', name: 'confirm' },
    context: null,
  } as Parameters<OnUserInputHandler>[0];
  const rpcArgs = {
    origin: 'https://example.com',
    originMetadata: null,
    request: { jsonrpc: '2.0', id: 4, method: 'rpc' },
  } as Parameters<OnRpcRequestHandler>[0];

  function setup(includeRpc = true): {
    handlers: ReturnType<typeof createSnapHandlers>;
    keyring: jest.MockedFunction<OnKeyringRequestHandler>;
    clientRequest: jest.MockedFunction<OnClientRequestHandler>;
    cronjob: jest.MockedFunction<OnCronjobHandler>;
    userInput: jest.MockedFunction<OnUserInputHandler>;
    rpc: jest.MockedFunction<OnRpcRequestHandler>;
    wrapper: jest.Mock;
  } {
    const keyring = jest
      .fn<
        ReturnType<OnKeyringRequestHandler>,
        Parameters<OnKeyringRequestHandler>
      >()
      .mockResolvedValue(null);
    const clientRequest = jest
      .fn<
        ReturnType<OnClientRequestHandler>,
        Parameters<OnClientRequestHandler>
      >()
      .mockResolvedValue(null);
    const cronjob = jest
      .fn<ReturnType<OnCronjobHandler>, Parameters<OnCronjobHandler>>()
      .mockResolvedValue(undefined);
    const userInput = jest
      .fn<ReturnType<OnUserInputHandler>, Parameters<OnUserInputHandler>>()
      .mockResolvedValue(undefined);
    const rpc = jest
      .fn<ReturnType<OnRpcRequestHandler>, Parameters<OnRpcRequestHandler>>()
      .mockResolvedValue(null);
    const wrapper = jest.fn();
    const withCatchAndThrowSnapError: WithCatchAndThrowSnapError = async (
      handler,
    ) => {
      wrapper();
      return handler();
    };

    const handlers = createSnapHandlers({
      keyring,
      clientRequest,
      cronjob,
      userInput,
      ...(includeRpc ? { rpc } : {}),
      withCatchAndThrowSnapError,
    });

    return {
      handlers,
      keyring,
      clientRequest,
      cronjob,
      userInput,
      rpc,
      wrapper,
    };
  }

  it('wraps and delegates each common handler', async () => {
    const {
      handlers,
      keyring,
      clientRequest,
      cronjob,
      userInput,
      rpc,
      wrapper,
    } = setup();

    await handlers.onKeyringRequest(keyringArgs);
    await handlers.onClientRequest(clientRequestArgs);
    await handlers.onCronjob(cronjobArgs);
    await handlers.onUserInput(userInputArgs);
    await handlers.onRpcRequest?.(rpcArgs);

    expect(keyring).toHaveBeenCalledWith(keyringArgs);
    expect(clientRequest).toHaveBeenCalledWith(clientRequestArgs);
    expect(cronjob).toHaveBeenCalledWith(cronjobArgs);
    expect(userInput).toHaveBeenCalledWith(userInputArgs);
    expect(rpc).toHaveBeenCalledWith(rpcArgs);
    expect(wrapper).toHaveBeenCalledTimes(5);
  });

  it('omits the RPC handler when none is provided', () => {
    const { handlers } = setup(false);

    expect(handlers).not.toHaveProperty('onRpcRequest');
  });

  it('surfaces errors through the injected wrapper', async () => {
    const error = new Error('Handler failed');
    const wrappedError = new Error('Wrapped handler error');
    const clientRequest = jest
      .fn<
        ReturnType<OnClientRequestHandler>,
        Parameters<OnClientRequestHandler>
      >()
      .mockRejectedValue(error);
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
    const { onClientRequest } = createSnapHandlers({
      keyring: jest.fn<
        ReturnType<OnKeyringRequestHandler>,
        Parameters<OnKeyringRequestHandler>
      >(),
      clientRequest,
      cronjob: jest.fn<
        ReturnType<OnCronjobHandler>,
        Parameters<OnCronjobHandler>
      >(),
      userInput: jest.fn<
        ReturnType<OnUserInputHandler>,
        Parameters<OnUserInputHandler>
      >(),
      withCatchAndThrowSnapError,
    });

    await expect(onClientRequest(clientRequestArgs)).rejects.toThrow(
      wrappedError,
    );
    expect(caughtError).toBe(error);
  });

  it('returns empty asset responses', async () => {
    const { handlers } = setup();

    expect(
      await handlers.onAssetsLookup({} as Parameters<OnAssetsLookupHandler>[0]),
    ).toStrictEqual({ assets: {} });
    expect(
      await handlers.onAssetsConversion(
        {} as Parameters<OnAssetsConversionHandler>[0],
      ),
    ).toStrictEqual({ conversionRates: {} });
    expect(
      await handlers.onAssetHistoricalPrice(
        {} as Parameters<OnAssetHistoricalPriceHandler>[0],
      ),
    ).toBeNull();
    expect(
      await handlers.onAssetsMarketData(
        {} as Parameters<OnAssetsMarketDataHandler>[0],
      ),
    ).toStrictEqual({ marketData: {} });
  });
});
