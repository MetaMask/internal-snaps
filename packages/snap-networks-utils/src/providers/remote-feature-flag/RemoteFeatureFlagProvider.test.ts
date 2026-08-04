import type { RemoteFeatureFlagControllerState } from '@metamask/remote-feature-flag-controller';

import type { RemoteFeatureFlagProviderMessenger } from './RemoteFeatureFlagProvider';
import { RemoteFeatureFlagProvider } from './RemoteFeatureFlagProvider';

const FLAG_KEY_A = 'flag-a';
const FLAG_KEY_B = 'flag-b';

const DEFAULT_STATE: RemoteFeatureFlagControllerState = {
  remoteFeatureFlags: {
    [FLAG_KEY_A]: 'value-a',
    [FLAG_KEY_B]: 2,
  },
  cacheTimestamp: 0,
};

type WithRemoteFeatureFlagProviderCallback<ReturnValue> = (payload: {
  remoteFeatureFlagProvider: RemoteFeatureFlagProvider;
  mockMessenger: jest.Mocked<RemoteFeatureFlagProviderMessenger>;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * Wraps tests for RemoteFeatureFlagProvider by creating a fresh provider with a
 * mock messenger. The callback receives the provider and mock for test configuration.
 *
 * @param testFunction - The test body receiving the provider and mocks.
 * @returns The return value of the callback.
 */
async function withRemoteFeatureFlagProvider<ReturnValue>(
  testFunction: WithRemoteFeatureFlagProviderCallback<ReturnValue>,
): Promise<ReturnValue> {
  const mockMessenger: jest.Mocked<RemoteFeatureFlagProviderMessenger> = {
    call: jest.fn().mockResolvedValue(DEFAULT_STATE),
  };

  const remoteFeatureFlagProvider = new RemoteFeatureFlagProvider({
    messenger: mockMessenger,
  });

  return await testFunction({
    remoteFeatureFlagProvider,
    mockMessenger,
  });
}

describe('RemoteFeatureFlagProvider', () => {
  describe('getFeatureFlag', () => {
    it('calls RemoteFeatureFlagController:getState and returns the flag value', async () => {
      await withRemoteFeatureFlagProvider(
        async ({ remoteFeatureFlagProvider, mockMessenger }) => {
          const value =
            await remoteFeatureFlagProvider.getFeatureFlag(FLAG_KEY_A);

          expect(mockMessenger.call).toHaveBeenCalledWith(
            'RemoteFeatureFlagController:getState',
          );
          expect(mockMessenger.call).toHaveBeenCalledTimes(1);
          expect(value).toBe('value-a');
        },
      );
    });

    it('returns undefined when the flag key is missing', async () => {
      await withRemoteFeatureFlagProvider(
        async ({ remoteFeatureFlagProvider }) => {
          const value =
            await remoteFeatureFlagProvider.getFeatureFlag('missing-flag');

          expect(value).toBeUndefined();
        },
      );
    });
  });

  describe('getFeatureFlags', () => {
    it('calls RemoteFeatureFlagController:getState once and returns a keyed map', async () => {
      await withRemoteFeatureFlagProvider(
        async ({ remoteFeatureFlagProvider, mockMessenger }) => {
          const values = await remoteFeatureFlagProvider.getFeatureFlags([
            FLAG_KEY_A,
            FLAG_KEY_B,
            'missing-flag',
          ]);

          expect(mockMessenger.call).toHaveBeenCalledWith(
            'RemoteFeatureFlagController:getState',
          );
          expect(mockMessenger.call).toHaveBeenCalledTimes(1);
          expect(values).toStrictEqual({
            [FLAG_KEY_A]: 'value-a',
            [FLAG_KEY_B]: 2,
            'missing-flag': undefined,
          });
        },
      );
    });

    it('returns an empty map when no keys are requested', async () => {
      await withRemoteFeatureFlagProvider(
        async ({ remoteFeatureFlagProvider, mockMessenger }) => {
          const values = await remoteFeatureFlagProvider.getFeatureFlags([]);

          expect(mockMessenger.call).toHaveBeenCalledWith(
            'RemoteFeatureFlagController:getState',
          );
          expect(values).toStrictEqual({});
        },
      );
    });
  });
});
