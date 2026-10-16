import { noopAssetHandlers } from '@metamask/snap-networks-utils';
import { SnapError } from '@metamask/snaps-sdk';

import {
  onAssetHistoricalPrice,
  onAssetsConversion,
  onAssetsLookup,
  onAssetsMarketData,
  onClientRequest,
  onCronjob,
  onKeyringRequest,
  onRpcRequest,
  onUserInput,
} from '.';

const mockClientRequestHandle = jest.fn();
const mockCronHandle = jest.fn();
const mockKeyringHandle = jest.fn();
const mockRpcHandle = jest.fn();
const mockUserInputHandle = jest.fn();
const snapRequest = jest.fn();

jest.mock('./context', () => ({
  clientRequestHandler: {
    handle: async (...args: unknown[]): Promise<unknown> =>
      mockClientRequestHandle(...args),
  },
  cronHandler: {
    handle: async (...args: unknown[]): Promise<unknown> =>
      mockCronHandle(...args),
  },
  keyringHandler: {
    handle: async (...args: unknown[]): Promise<unknown> =>
      mockKeyringHandle(...args),
  },
  rpcHandler: {
    handle: async (...args: unknown[]): Promise<unknown> =>
      mockRpcHandle(...args),
  },
  userInputHandler: {
    handle: async (...args: unknown[]): Promise<unknown> =>
      mockUserInputHandle(...args),
  },
}));

/**
 * Resets the entrypoint mocks and executes a test with a configured Snap API.
 *
 * @param testFn - The test body receiving the Snap request mock.
 * @returns Whatever the test function returns.
 */
async function withEntrypointMocks(
  testFn: (setup: { snapRequest: jest.Mock }) => void | Promise<void>,
): Promise<void> {
  jest.resetAllMocks();
  snapRequest.mockResolvedValue(undefined);
  Object.assign(globalThis, { snap: { request: snapRequest } });

  await testFn({ snapRequest });
}

describe('entrypoints', () => {
  const origin = 'https://example.com';
  const request = { jsonrpc: '2.0', id: 1, method: 'foo' } as const;
  const userInputParams = { id: 'id', event: {}, context: null };

  const entrypoints: [string, () => Promise<unknown>, jest.Mock, unknown[]][] =
    [
      [
        'onClientRequest',
        async (): Promise<unknown> => onClientRequest({ request } as never),
        mockClientRequestHandle,
        [request],
      ],
      [
        'onCronjob',
        async (): Promise<unknown> => onCronjob({ request } as never),
        mockCronHandle,
        [request],
      ],
      [
        'onKeyringRequest',
        async (): Promise<unknown> =>
          onKeyringRequest({ origin, request } as never),
        mockKeyringHandle,
        [origin, request],
      ],
      [
        'onRpcRequest',
        async (): Promise<unknown> =>
          onRpcRequest({ origin, request } as never),
        mockRpcHandle,
        [origin, request],
      ],
      [
        'onUserInput',
        async (): Promise<unknown> => onUserInput(userInputParams as never),
        mockUserInputHandle,
        [userInputParams],
      ],
    ];

  it.each(entrypoints)(
    'delegates %s to its handler',
    async (_name, callEntrypoint, handle, expectedArgs) => {
      await withEntrypointMocks(async ({ snapRequest: mockSnapRequest }) => {
        handle.mockResolvedValue('result');

        expect(await callEntrypoint()).toBe('result');
        expect(handle).toHaveBeenCalledWith(...expectedArgs);
        expect(mockSnapRequest).not.toHaveBeenCalled();
      });
    },
  );

  it.each(entrypoints)(
    'normalizes and tracks %s errors',
    async (_name, callEntrypoint, handle) => {
      await withEntrypointMocks(async ({ snapRequest: mockSnapRequest }) => {
        handle.mockRejectedValue(new Error('Handler failed'));

        await expect(callEntrypoint()).rejects.toBeInstanceOf(SnapError);
        expect(mockSnapRequest).toHaveBeenCalledWith({
          method: 'snap_trackError',
          params: {
            error: expect.objectContaining({ message: 'Handler failed' }),
          },
        });
      });
    },
  );

  it('sanitizes sensitive errors before tracking them', async () => {
    await withEntrypointMocks(async ({ snapRequest: mockSnapRequest }) => {
      mockKeyringHandle.mockRejectedValue(
        new Error('Invalid private key 0xabc'),
      );

      await expect(
        onKeyringRequest({ origin, request } as never),
      ).rejects.toBeInstanceOf(SnapError);
      expect(mockSnapRequest).toHaveBeenCalledWith({
        method: 'snap_trackError',
        params: {
          error: expect.objectContaining({
            message:
              'Key derivation failed. Please check your connection and try again.',
          }),
        },
      });
    });
  });

  it('exports the shared no-op asset handlers', () => {
    expect({
      onAssetsLookup,
      onAssetsConversion,
      onAssetHistoricalPrice,
      onAssetsMarketData,
    }).toStrictEqual(noopAssetHandlers);
  });
});
