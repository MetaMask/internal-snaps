import type { Mock } from 'vitest';

import type { BrazeSdk } from '../src/braze-sdk';
import { brazeSdkLoader } from '../src/braze-sdk';

export type FakeBrazeSdk = {
  DeviceProperties: Record<string, string>;
  isInitialized: Mock<() => boolean>;
  initialize: Mock<(apiKey: string, options: object) => boolean>;
  destroy: Mock<() => void>;
  requestImmediateDataFlush: Mock<
    (callback?: (success: boolean) => void) => void
  >;
  getUser: Mock<
    () =>
      | {
          getUserId: () => string | null;
          setLanguage: (language: string) => boolean;
        }
      | undefined
  >;
  changeUser: Mock<(userId: string) => void>;
  setLanguage: Mock<(language: string) => boolean>;
};

/**
 * Make the SDK loader return a fake SDK.
 *
 * @param userId - The ID of the current user, if any.
 * @returns The fake SDK.
 */
export function mockBrazeSdk(userId?: string): FakeBrazeSdk {
  let initialized = false;
  let currentUserId = userId;

  const sdk: FakeBrazeSdk = {
    DeviceProperties: {
      BROWSER: 'browser',
      OS: 'os',
      LANGUAGE: 'language',
      TIME_ZONE: 'time_zone',
    },
    isInitialized: vi.fn(() => initialized),
    initialize: vi.fn(() => {
      initialized = true;
      return true;
    }),
    destroy: vi.fn(() => {
      initialized = false;
    }),
    requestImmediateDataFlush: vi.fn((onFlushed) => onFlushed?.(true)),
    getUser: vi.fn(() =>
      initialized
        ? {
            getUserId: () => currentUserId ?? null,
            setLanguage: sdk.setLanguage,
          }
        : undefined,
    ),
    changeUser: vi.fn((id) => {
      currentUserId = id;
    }),
    setLanguage: vi.fn(() => true),
  };

  vi.spyOn(brazeSdkLoader, 'load').mockResolvedValue(
    sdk as unknown as BrazeSdk,
  );
  return sdk;
}
