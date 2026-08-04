import type { RemoteFeatureFlagControllerState } from '@metamask/remote-feature-flag-controller';

import type { RemoteFeatureFlagsProviderMessenger } from './RemoteFeatureFlagsProvider';
import { RemoteFeatureFlagsProvider } from './RemoteFeatureFlagsProvider';

const FLAG_KEY_A = 'flag-a';
const FLAG_KEY_B = 'flag-b';

const DEFAULT_STATE: RemoteFeatureFlagControllerState = {
  remoteFeatureFlags: {
    [FLAG_KEY_A]: 'value-a',
    [FLAG_KEY_B]: 2,
  },
  cacheTimestamp: 0,
};

type WithRemoteFeatureFlagsProviderCallback<ReturnValue> = (payload: {
  remoteFeatureFlagsProvider: RemoteFeatureFlagsProvider;
  mockMessenger: jest.Mocked<RemoteFeatureFlagsProviderMessenger>;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * Wraps tests for RemoteFeatureFlagsProvider by creating a fresh provider with a
 * mock messenger. The callback receives the provider and mock for test configuration.
 *
 * @param testFunction - The test body receiving the provider and mocks.
 * @returns The return value of the callback.
 */
async function withRemoteFeatureFlagsProvider<ReturnValue>(
  testFunction: WithRemoteFeatureFlagsProviderCallback<ReturnValue>,
): Promise<ReturnValue> {
  const mockMessenger: jest.Mocked<RemoteFeatureFlagsProviderMessenger> = {
    call: jest.fn().mockResolvedValue(DEFAULT_STATE),
  };

  const remoteFeatureFlagsProvider = new RemoteFeatureFlagsProvider({
    messenger: mockMessenger,
  });

  return await testFunction({
    remoteFeatureFlagsProvider,
    mockMessenger,
  });
}

describe('RemoteFeatureFlagsProvider', () => {
  describe('getFeatureFlag', () => {
    it('calls `RemoteFeatureFlagController:getState` and returns the flag value', async () => {
      await withRemoteFeatureFlagsProvider(
        async ({ remoteFeatureFlagsProvider, mockMessenger }) => {
          const value =
            await remoteFeatureFlagsProvider.getFeatureFlag(FLAG_KEY_A);

          expect(mockMessenger.call).toHaveBeenCalledWith(
            'RemoteFeatureFlagController:getState',
          );
          expect(mockMessenger.call).toHaveBeenCalledTimes(1);
          expect(value).toBe('value-a');
        },
      );
    });

    it('returns undefined when the flag key is missing', async () => {
      await withRemoteFeatureFlagsProvider(
        async ({ remoteFeatureFlagsProvider }) => {
          const value =
            await remoteFeatureFlagsProvider.getFeatureFlag('missing-flag');

          expect(value).toBeUndefined();
        },
      );
    });
  });

  describe('getFeatureFlags', () => {
    it('calls `RemoteFeatureFlagController:getState` once and returns a keyed map', async () => {
      await withRemoteFeatureFlagsProvider(
        async ({ remoteFeatureFlagsProvider, mockMessenger }) => {
          const values = await remoteFeatureFlagsProvider.getFeatureFlags([
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
      await withRemoteFeatureFlagsProvider(
        async ({ remoteFeatureFlagsProvider, mockMessenger }) => {
          const values = await remoteFeatureFlagsProvider.getFeatureFlags([]);

          expect(mockMessenger.call).toHaveBeenCalledWith(
            'RemoteFeatureFlagController:getState',
          );
          expect(values).toStrictEqual({});
        },
      );
    });
  });
});
