import { handleKeyringRequest } from '@metamask/keyring-snap-sdk/v2';
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
  onUserInput,
} from '.';
import { AccountBalanceUnavailableException } from './handlers/keyring/exceptions';
import { logger } from './utils/logger';

const mockKeyringHandle = jest.fn();
const mockUserInputHandle = jest.fn();
const mockClientRequestHandle = jest.fn();
const mockCronjobHandle = jest.fn();

jest.mock('./utils/logger');

jest.mock('./context', () => ({
  keyringHandler: {
    handle: async (...args: unknown[]): Promise<unknown> =>
      mockKeyringHandle(...args),
  },
  userInputHandler: {
    handle: async (...args: unknown[]): Promise<unknown> =>
      mockUserInputHandle(...args),
  },
  clientRequestHandler: {
    handle: async (...args: unknown[]): Promise<unknown> =>
      mockClientRequestHandle(...args),
  },
  cronjobHandler: {
    handle: async (...args: unknown[]): Promise<unknown> =>
      mockCronjobHandle(...args),
  },
}));

describe('entrypoints', () => {
  const snapRequest = jest.fn();
  const origin = 'https://example.com';
  const request = { jsonrpc: '2.0', id: 1, method: 'foo' } as const;
  const userInputParams = { id: 'id', event: {}, context: null };

  const entrypoints: [
    string,
    () => Promise<unknown>,
    jest.Mock,
    unknown[],
    string[],
  ][] = [
    [
      'onKeyringRequest',
      async (): Promise<unknown> =>
        onKeyringRequest({ origin, request } as never),
      mockKeyringHandle,
      [origin, request],
      ['[🔑 KeyringHandler]'],
    ],
    [
      'onClientRequest',
      async (): Promise<unknown> => onClientRequest({ request } as never),
      mockClientRequestHandle,
      [request],
      ['[👋 ClientRequestHandler]'],
    ],
    [
      'onCronjob',
      async (): Promise<unknown> => onCronjob({ request } as never),
      mockCronjobHandle,
      [request],
      [],
    ],
    [
      'onUserInput',
      async (): Promise<unknown> => onUserInput(userInputParams as never),
      mockUserInputHandle,
      [userInputParams],
      [],
    ],
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    snapRequest.mockResolvedValue(undefined);
    Object.assign(globalThis, { snap: { request: snapRequest } });
  });

  it.each(entrypoints)(
    'delegates %s to its handler',
    async (_name, callEntrypoint, handle, expectedArgs) => {
      handle.mockResolvedValue('result');

      expect(await callEntrypoint()).toBe('result');
      expect(handle).toHaveBeenCalledWith(...expectedArgs);
      expect(snapRequest).not.toHaveBeenCalled();
    },
  );

  it.each(entrypoints)(
    'normalizes, tracks, and logs %s errors',
    async (_name, callEntrypoint, handle, _expectedArgs, prefixes) => {
      handle.mockRejectedValue(new Error('Handler failed'));

      await expect(callEntrypoint()).rejects.toBeInstanceOf(SnapError);

      expect(snapRequest).toHaveBeenCalledWith({
        method: 'snap_trackError',
        params: {
          error: expect.objectContaining({ message: 'Handler failed' }),
        },
      });
      expect(logger.error).toHaveBeenCalledWith(
        ...prefixes,
        { error: expect.any(SnapError) },
        expect.stringContaining('[SnapError]'),
      );
    },
  );

  describe('the "not synchronized yet" balance state through the real keyring path (v3)', () => {
    const balancesRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'keyring_getAccountBalances',
      params: {
        id: '9b1c3a4e-2f6d-4b8a-9c1e-5d7f3a2b1c0d',
        assets: ['stellar:pubnet/slip44:148'],
      },
    } as const;

    const keyringThrowing = (error: Error): unknown => ({
      getAccountBalances: jest.fn().mockRejectedValue(error),
    });

    it('is re-created by handleKeyringRequest as a plain Error, yet not tracked', async () => {
      const keyring = keyringThrowing(
        new AccountBalanceUnavailableException('account-1'),
      );
      // Same as KeyringHandler.handle: the SDK dispatches the request and
      // re-creates every non-SnapError as `new Error(message)`.
      mockKeyringHandle.mockImplementation(async (_origin, keyringRequest) =>
        handleKeyringRequest(keyring as never, keyringRequest),
      );

      await expect(
        onKeyringRequest({ origin, request: balancesRequest } as never),
      ).rejects.toThrow('not been synchronized yet');

      expect(mockKeyringHandle).toHaveBeenCalled();
      expect(snapRequest).not.toHaveBeenCalledWith(
        expect.objectContaining({ method: 'snap_trackError' }),
      );
    });

    it('still tracks other keyring errors re-created by the SDK', async () => {
      const keyring = keyringThrowing(new Error('Horizon request failed'));
      mockKeyringHandle.mockImplementation(async (_origin, keyringRequest) =>
        handleKeyringRequest(keyring as never, keyringRequest),
      );

      await expect(
        onKeyringRequest({ origin, request: balancesRequest } as never),
      ).rejects.toBeInstanceOf(SnapError);

      expect(snapRequest).toHaveBeenCalledWith({
        method: 'snap_trackError',
        params: {
          error: expect.objectContaining({ message: 'Horizon request failed' }),
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
