import type { JsonRpcRequest } from '@metamask/utils';

import { mockBrazeSdk } from '../tests/braze';
import { stubSnap } from '../tests/snap';
import { SESSION_TIMEOUT_SECONDS } from './constants';
import { BrazeMethod, onClientRequest } from './rpc';
import { resetRuntime } from './runtime';
import { resetStorage } from './storage';

const PARAMS = {
  profileId: 'profile-id',
  config: {
    apiKey: '00000000-0000-0000-0000-000000000000',
    endpoint: 'sdk.iad-01.braze.com',
    appVersion: '13.0.0',
  },
};

/**
 * Call the client request handler.
 *
 * @param method - The method.
 * @param params - The params.
 * @returns The handler result.
 */
async function call(method: string, params: unknown): Promise<unknown> {
  return onClientRequest({
    request: {
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    } as JsonRpcRequest,
  });
}

describe('onClientRequest', () => {
  beforeEach(() => {
    resetRuntime();
    resetStorage();
    stubSnap();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('rejects unknown methods', async () => {
    await expect(call('wipeData', {})).rejects.toThrow(
      'The method does not exist / is not available.',
    );
  });

  describe('syncUser', () => {
    it('changes the user when it differs from the current one', async () => {
      const { changeUser } = mockBrazeSdk('other-profile-id');

      expect(await call(BrazeMethod.SyncUser, PARAMS)).toStrictEqual({
        flushed: true,
      });
      expect(changeUser).toHaveBeenCalledWith('profile-id');
    });

    it('returns flushed: false when the flush does not succeed', async () => {
      const { requestImmediateDataFlush } = mockBrazeSdk('profile-id');
      requestImmediateDataFlush.mockImplementation((onFlushed) =>
        onFlushed?.(false),
      );

      expect(await call(BrazeMethod.SyncUser, PARAMS)).toStrictEqual({
        flushed: false,
      });
    });

    it('keeps the current user when it is the same and flushes to renew sessions', async () => {
      const { changeUser, requestImmediateDataFlush } =
        mockBrazeSdk('profile-id');

      await call(BrazeMethod.SyncUser, PARAMS);

      expect(changeUser).not.toHaveBeenCalled();
      expect(requestImmediateDataFlush).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['missing params', undefined],
      ['an empty profile ID', { ...PARAMS, profileId: '' }],
      ['an empty language', { ...PARAMS, language: '' }],
      [
        'an endpoint with a path or scheme',
        {
          ...PARAMS,
          config: {
            ...PARAMS.config,
            endpoint: 'https://sdk.iad-01.braze.com/evil',
          },
        },
      ],
      [
        'an endpoint with credentials',
        {
          ...PARAMS,
          config: {
            ...PARAMS.config,
            endpoint: 'user:pass@sdk.iad-01.braze.com',
          },
        },
      ],
      [
        'an endpoint with invalid host syntax',
        {
          ...PARAMS,
          config: {
            ...PARAMS.config,
            endpoint: '[invalid',
          },
        },
      ],
      ['unknown fields', { ...PARAMS, extra: true }],
    ])('rejects %s', async (_, params) => {
      const { changeUser } = mockBrazeSdk();

      await expect(call(BrazeMethod.SyncUser, params)).rejects.toThrow(
        expect.objectContaining({ code: -32602 }),
      );
      expect(changeUser).not.toHaveBeenCalled();
    });

    describe('language', () => {
      it('sets the language before changeUser when there is no current user', async () => {
        const { setLanguage, changeUser } = mockBrazeSdk();

        await call(BrazeMethod.SyncUser, { ...PARAMS, language: 'fr' });

        expect(setLanguage).toHaveBeenCalledWith('fr');
        expect(setLanguage.mock.invocationCallOrder[0]).toBeLessThan(
          changeUser.mock.invocationCallOrder[0] as number,
        );
      });

      it('sets the language after changeUser when switching users', async () => {
        const { setLanguage, changeUser } = mockBrazeSdk('other-profile-id');

        await call(BrazeMethod.SyncUser, { ...PARAMS, language: 'fr' });

        expect(setLanguage).toHaveBeenCalledWith('fr');
        expect(changeUser.mock.invocationCallOrder[0]).toBeLessThan(
          setLanguage.mock.invocationCallOrder[0] as number,
        );
      });

      it('does not set the same language again while the session is active, and slides the window', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        const { setLanguage } = mockBrazeSdk();

        await call(BrazeMethod.SyncUser, { ...PARAMS, language: 'fr' });
        vi.advanceTimersByTime((SESSION_TIMEOUT_SECONDS - 60) * 1000);
        await call(BrazeMethod.SyncUser, { ...PARAMS, language: 'fr' });
        vi.advanceTimersByTime((SESSION_TIMEOUT_SECONDS - 60) * 1000);
        await call(BrazeMethod.SyncUser, { ...PARAMS, language: 'fr' });

        expect(setLanguage).toHaveBeenCalledTimes(1);
      });

      it('re-sets the language once the session window expires', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        const { setLanguage } = mockBrazeSdk();

        await call(BrazeMethod.SyncUser, { ...PARAMS, language: 'fr' });
        vi.advanceTimersByTime(SESSION_TIMEOUT_SECONDS * 1000);
        await call(BrazeMethod.SyncUser, { ...PARAMS, language: 'fr' });

        expect(setLanguage).toHaveBeenCalledTimes(2);
      });

      it('re-sets the language on retry if the flush did not succeed', async () => {
        const { setLanguage, requestImmediateDataFlush } = mockBrazeSdk();
        requestImmediateDataFlush.mockImplementationOnce((onFlushed) =>
          onFlushed?.(false),
        );

        await call(BrazeMethod.SyncUser, { ...PARAMS, language: 'fr' });
        await call(BrazeMethod.SyncUser, { ...PARAMS, language: 'fr' });

        expect(setLanguage).toHaveBeenCalledTimes(2);
      });

      it('sets a changed language', async () => {
        const { setLanguage } = mockBrazeSdk();

        await call(BrazeMethod.SyncUser, { ...PARAMS, language: 'fr' });
        await call(BrazeMethod.SyncUser, { ...PARAMS, language: 'de' });

        expect(setLanguage.mock.calls).toStrictEqual([['fr'], ['de']]);
      });

      it('sets the language again for another user', async () => {
        const { setLanguage } = mockBrazeSdk();

        await call(BrazeMethod.SyncUser, { ...PARAMS, language: 'fr' });
        await call(BrazeMethod.SyncUser, {
          ...PARAMS,
          profileId: 'other-profile-id',
          language: 'fr',
        });

        expect(setLanguage).toHaveBeenCalledTimes(2);
      });

      it('tries again when the SDK does not accept the language', async () => {
        const { setLanguage } = mockBrazeSdk();
        setLanguage.mockReturnValueOnce(false);

        await call(BrazeMethod.SyncUser, { ...PARAMS, language: 'fr' });
        await call(BrazeMethod.SyncUser, { ...PARAMS, language: 'fr' });

        expect(setLanguage).toHaveBeenCalledTimes(2);
      });

      it('leaves the language unchanged when none is given', async () => {
        const { setLanguage } = mockBrazeSdk();

        await call(BrazeMethod.SyncUser, PARAMS);

        expect(setLanguage).not.toHaveBeenCalled();
      });
    });

    it('accepts custom endpoints, non-UUID test keys, and the logging flag', async () => {
      const { changeUser } = mockBrazeSdk();

      await call(BrazeMethod.SyncUser, {
        ...PARAMS,
        config: {
          ...PARAMS.config,
          apiKey: 'synthetic-test-key',
          endpoint: 'localhost:8080',
          enableLogging: true,
        },
      });

      expect(changeUser).toHaveBeenCalledWith('profile-id');
    });
  });
});
