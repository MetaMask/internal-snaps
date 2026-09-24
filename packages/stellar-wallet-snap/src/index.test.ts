import { SnapError } from '@metamask/snaps-sdk';

import { onClientRequest, onCronjob, onKeyringRequest, onUserInput } from '.';
import { logger } from './utils/logger';

const mockHandle = jest.fn();

jest.mock('./utils/logger');

jest.mock('./context', () => {
  const handler = {
    handle: async (...args: unknown[]): Promise<unknown> => mockHandle(...args),
  };
  return {
    keyringHandler: handler,
    userInputHandler: handler,
    clientRequestHandler: handler,
    cronjobHandler: handler,
  };
});

describe('wrapped entrypoints', () => {
  const snapRequest = jest.fn();
  const request = { jsonrpc: '2.0', id: 1, method: 'foo' } as const;

  beforeEach(() => {
    jest.clearAllMocks();
    snapRequest.mockResolvedValue(undefined);
    Object.assign(globalThis, { snap: { request: snapRequest } });
    mockHandle.mockRejectedValue(new Error('Handler failed'));
  });

  it.each([
    [
      'onKeyringRequest',
      async (): Promise<unknown> =>
        onKeyringRequest({ origin: 'https://example.com', request } as never),
      ['[🔑 KeyringHandler]'],
    ],
    [
      'onClientRequest',
      async (): Promise<unknown> => onClientRequest({ request } as never),
      ['[👋 ClientRequestHandler]'],
    ],
    [
      'onCronjob',
      async (): Promise<unknown> => onCronjob({ request } as never),
      [],
    ],
    [
      'onUserInput',
      async (): Promise<unknown> =>
        onUserInput({ id: 'id', event: {}, context: null } as never),
      [],
    ],
  ])(
    'normalizes, tracks, and logs %s errors',
    async (_name, callHandler: () => Promise<unknown>, prefixes: string[]) => {
      await expect(callHandler()).rejects.toBeInstanceOf(SnapError);

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
});
