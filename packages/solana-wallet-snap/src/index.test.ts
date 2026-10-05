import { installSnap } from '@metamask/snaps-jest';
import { SnapError } from '@metamask/snaps-sdk';

import {
  onActive,
  onCronjob,
  onInactive,
  onInstall,
  onStart,
  onUpdate,
  onUserInput,
  onWebSocketEvent,
} from '.';
import { handlers } from './core/handlers/onCronjob';
import { ScheduleBackgroundEventMethod } from './core/handlers/onCronjob/backgroundEvents/ScheduleBackgroundEventMethod';

const mockEmit = jest.fn();

// Avoid loading the ESM-only `@noble/ed25519` package and patching
// `globalThis.crypto.subtle` from this test file. Tests here don't exercise
// crypto, and a global patch would leak into other test suites under
// `--runInBand` because `globalThis` is shared across files.
jest.mock('./polyfills', () => ({
  installPolyfills: jest.fn(),
}));

jest.mock('./features/confirmation/views/ConfirmSignIn/events', () => ({
  eventHandlers: {
    failing: jest.fn().mockRejectedValue(new Error('User input failed')),
  },
}));

jest.mock('./snapContext', () => ({
  eventEmitter: {
    emitSync: async (...args: unknown[]): Promise<unknown> => mockEmit(...args),
  },
  keyring: {
    listAccounts: jest.fn(),
    createAccount: jest.fn(),
  },
  state: {
    getKey: jest.fn().mockResolvedValue(Date.now()),
    setKey: jest.fn(),
    setKeyWith: jest.fn(),
  },
}));

describe('onRpcRequest', () => {
  it('throws an error if the requested method does not exist', async () => {
    const { request } = await installSnap();

    const response = await request({
      method: 'foo',
    });

    expect(response).toRespondWithError({
      code: 4100,
      message: 'Permission denied',
      stack: expect.any(String),
    });
  });
});

describe('onKeyringRequest', () => {
  it('throws an error if the requested method does not exist', async () => {
    const { request } = await installSnap();

    const response = await request({
      method: 'wallet_invokeSnap',
      params: {
        snapId: 'npm:@metamask/solana-wallet-snap',
        request: {
          method: 'foo',
        },
      },
    });

    expect(response).toRespondWithError({
      code: 4100,
      message: 'Permission denied',
      stack: expect.any(String),
    });
  });
});

describe('onCronjob', () => {
  it('throws an error if the requested method is invalid', async () => {
    await expect(
      onCronjob({
        request: {
          id: '1',
          jsonrpc: '2.0',
          method: 'foo',
        },
      }),
    ).rejects.toThrow(/Expected one of/u);
  });

  it('calls the correct handler', async () => {
    const handler = jest.fn();
    handlers[ScheduleBackgroundEventMethod.RefreshConfirmationEstimation] =
      handler;

    const snap = {
      request: jest.fn().mockResolvedValue({ locked: false, active: true }),
    };

    (globalThis as any).snap = snap;

    await onCronjob({
      request: {
        id: '1',
        jsonrpc: '2.0',
        method: ScheduleBackgroundEventMethod.RefreshConfirmationEstimation,
      },
    });

    expect(handler).toHaveBeenCalled();
  });
});

describe('wrapped entrypoint failures', () => {
  const snapRequest = jest.fn();

  beforeEach(() => {
    snapRequest.mockReset().mockResolvedValue(undefined);
    Object.assign(globalThis, { snap: { request: snapRequest } });
  });

  function expectTracked(message: string): void {
    expect(snapRequest).toHaveBeenCalledWith({
      method: 'snap_trackError',
      params: {
        error: expect.objectContaining({ message }),
      },
    });
  }

  it.each([
    ['onStart', async (): Promise<unknown> => onStart({} as never)],
    ['onUpdate', async (): Promise<unknown> => onUpdate({} as never)],
    ['onInstall', async (): Promise<unknown> => onInstall({} as never)],
    ['onActive', async (): Promise<unknown> => onActive({} as never)],
    ['onInactive', async (): Promise<unknown> => onInactive({} as never)],
    [
      'onWebSocketEvent',
      async (): Promise<unknown> => onWebSocketEvent({ event: {} } as never),
    ],
  ])(
    'normalizes and tracks %s errors',
    async (_name, callHandler: () => Promise<unknown>) => {
      mockEmit.mockRejectedValueOnce(new Error('Event failed'));

      await expect(callHandler()).rejects.toBeInstanceOf(SnapError);
      expectTracked('Event failed');
    },
  );

  it('normalizes and tracks onUserInput errors', async () => {
    const result = onUserInput({
      id: 'interface-id',
      event: { type: 'ButtonClickEvent', name: 'failing' },
      context: null,
    } as never);

    await expect(result).rejects.toBeInstanceOf(SnapError);
    await expect(result).rejects.toThrow('User input failed');
    expectTracked('User input failed');
  });
});
