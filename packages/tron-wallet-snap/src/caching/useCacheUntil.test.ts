import type { Serializable } from '@metamask/snap-networks-utils';

import type { ICache } from './ICache';
import { useCacheUntil } from './useCacheUntil';
import type { CacheUntilOptions, ResultWithExpiry } from './useCacheUntil';

// Define common cache options
const cacheOptions: CacheUntilOptions = {
  functionName: 'testFunction',
};
// Mock current time
const mockNow = 1700000000000; // Fixed timestamp for testing

type WithUseCacheUntilCallback = (payload: {
  actualExecutionSpy: jest.Mock<
    Promise<ResultWithExpiry<Serializable>>,
    Serializable[]
  >;
  cache: MockCache;
  testFunction: () => Promise<ResultWithExpiry<string>>;
  cachedTestFunction: () => Promise<string>;
  cachedTestFunctionWithArgs: (arg1: string) => Promise<string>;
}) => void | Promise<void>;

type MockCache = ICache<Serializable> & {
  get: jest.Mock<Promise<Serializable | undefined>, [string]>;
  set: jest.Mock<Promise<void>, [string, Serializable, (number | undefined)?]>;
};

/**
 * Wraps tests for `useCacheUntil` by creating fresh cached functions backed by a
 * mock cache.
 *
 * @param testFn - The test body receiving the cached functions.
 * @returns A promise that resolves when the test function completes.
 */
async function withUseCacheUntil(
  testFn: WithUseCacheUntilCallback,
): Promise<void> {
  jest.useFakeTimers();
  jest.setSystemTime(mockNow);

  // Reset mocks for each test
  const actualExecutionSpy = jest
    .fn<Promise<ResultWithExpiry<Serializable>>, Serializable[]>()
    .mockResolvedValue({
      result: 'test',
      expiresAt: mockNow + 60000, // Expires in 60 seconds
    });

  // Create a mock cache
  const cache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
  } as unknown as MockCache;

  // Define original functions
  const testFunction = async (): Promise<ResultWithExpiry<string>> =>
    (await actualExecutionSpy()) as ResultWithExpiry<string>;
  const testFunctionWithArgs = async (
    arg1: string,
  ): Promise<ResultWithExpiry<string>> =>
    (await actualExecutionSpy(arg1)) as ResultWithExpiry<string>;

  // Create cached versions
  const cachedTestFunction = useCacheUntil(testFunction, cache, {
    ...cacheOptions,
    functionName: 'testFunction',
  });

  const cachedTestFunctionWithArgs = useCacheUntil(
    testFunctionWithArgs,
    cache,
    {
      ...cacheOptions,
      functionName: 'testFunctionWithArgs',
    },
  );

  try {
    await testFn({
      actualExecutionSpy,
      cache,
      testFunction,
      cachedTestFunction,
      cachedTestFunctionWithArgs,
    });
  } finally {
    jest.useRealTimers();
  }
}

describe('useCacheUntil', () => {
  describe('when the data is not cached', () => {
    it('caches the result with TTL calculated from expiresAt', async () => {
      await withUseCacheUntil(
        async ({ cache, cachedTestFunction, actualExecutionSpy }) => {
          // No cached data
          cache.get.mockResolvedValue(undefined);

          const result = await cachedTestFunction();

          expect(result).toBe('test');
          expect(actualExecutionSpy).toHaveBeenCalledTimes(1);
          // TTL should be expiresAt - now = 60000
          expect(cache.set).toHaveBeenCalledWith(
            'testFunction:',
            'test',
            60000,
          );
        },
      );
    });

    it('uses zero TTL when expiresAt is in the past', async () => {
      await withUseCacheUntil(
        async ({ cache, cachedTestFunction, actualExecutionSpy }) => {
          actualExecutionSpy.mockResolvedValue({
            result: 'test',
            expiresAt: mockNow - 1000, // Already expired
          });

          const result = await cachedTestFunction();

          expect(result).toBe('test');
          // TTL should be 0 when expiresAt is in the past
          expect(cache.set).toHaveBeenCalledWith('testFunction:', 'test', 0);
        },
      );
    });
  });

  describe('when the data is cached and not expired', () => {
    it('returns the cached result without calling the function', async () => {
      await withUseCacheUntil(
        async ({ cache, cachedTestFunction, actualExecutionSpy }) => {
          // First call to populate the cache and expiry map
          cache.get.mockResolvedValue(undefined);
          await cachedTestFunction();

          // Reset mocks
          actualExecutionSpy.mockClear();
          cache.get.mockResolvedValue('cached-test');

          // Second call within expiry period
          const result = await cachedTestFunction();

          expect(result).toBe('cached-test');
          expect(actualExecutionSpy).not.toHaveBeenCalled();
          expect(cache.set).toHaveBeenCalledTimes(1); // Only from first call
        },
      );
    });

    it('hydrates the cached result when the wrapper is recreated', async () => {
      await withUseCacheUntil(
        async ({
          cache,
          cachedTestFunction,
          actualExecutionSpy,
          testFunction,
        }) => {
          cache.get.mockResolvedValue(undefined);
          await cachedTestFunction();

          actualExecutionSpy.mockClear();
          cache.get.mockResolvedValue('persisted-test');
          const recreatedCachedFunction = useCacheUntil(testFunction, cache, {
            ...cacheOptions,
            functionName: 'testFunction',
          });

          expect(await recreatedCachedFunction()).toBe('persisted-test');
          expect(actualExecutionSpy).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('when the data is cached but expired', () => {
    it('fetches fresh data after expiry time has passed', async () => {
      await withUseCacheUntil(
        async ({ cache, cachedTestFunction, actualExecutionSpy }) => {
          // First call to populate the cache
          cache.get.mockResolvedValue(undefined);
          await cachedTestFunction();

          // Advance time past the expiry
          jest.setSystemTime(mockNow + 70000); // 70 seconds later

          // Reset mocks for second call
          actualExecutionSpy.mockClear();
          actualExecutionSpy.mockResolvedValue({
            result: 'fresh-test',
            expiresAt: mockNow + 70000 + 60000, // New expiry
          });

          const result = await cachedTestFunction();

          expect(result).toBe('fresh-test');
          expect(actualExecutionSpy).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('cache key generation', () => {
    it('generates cache key with function name and arguments', async () => {
      await withUseCacheUntil(
        async ({ cache, cachedTestFunctionWithArgs, actualExecutionSpy }) => {
          cache.get.mockResolvedValue(undefined);
          actualExecutionSpy.mockResolvedValue({
            result: 'test with args',
            expiresAt: mockNow + 60000,
          });

          await cachedTestFunctionWithArgs('hello');

          expect(cache.set).toHaveBeenCalledWith(
            'testFunctionWithArgs:"hello"',
            'test with args',
            60000,
          );
        },
      );
    });

    it('uses a custom key generator if provided', async () => {
      await withUseCacheUntil(async ({ cache, testFunction }) => {
        const customKeyGenerator = jest.fn().mockReturnValue('custom-key');

        const customCachedFunction = useCacheUntil(testFunction, cache, {
          ...cacheOptions,
          generateCacheKey: customKeyGenerator,
        });

        await customCachedFunction();

        expect(customKeyGenerator).toHaveBeenCalledTimes(1);
        expect(cache.set).toHaveBeenCalledWith('custom-key', 'test', 60000);
      });
    });
  });

  describe('error handling', () => {
    it('propagates errors from the original function', async () => {
      await withUseCacheUntil(
        async ({ cache, cachedTestFunction, actualExecutionSpy }) => {
          const error = new Error('Test error');
          actualExecutionSpy.mockRejectedValueOnce(error);

          await expect(cachedTestFunction()).rejects.toThrow('Test error');
          expect(cache.set).not.toHaveBeenCalled();
        },
      );
    });

    it('handles cache get errors gracefully', async () => {
      await withUseCacheUntil(
        async ({ cache, cachedTestFunction, actualExecutionSpy }) => {
          // First call to populate expiry map
          cache.get.mockResolvedValue(undefined);
          await cachedTestFunction();

          // Reset for second call
          actualExecutionSpy.mockClear();
          cache.get.mockRejectedValueOnce(new Error('Cache error'));
          actualExecutionSpy.mockResolvedValue({
            result: 'test',
            expiresAt: mockNow + 60000,
          });

          const result = await cachedTestFunction();

          expect(result).toBe('test');
          expect(actualExecutionSpy).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('handles cache set errors gracefully', async () => {
      await withUseCacheUntil(
        async ({ cache, cachedTestFunction, actualExecutionSpy }) => {
          cache.get.mockResolvedValue(undefined);
          cache.set.mockRejectedValueOnce(new Error('Cache set error'));

          const result = await cachedTestFunction();

          expect(result).toBe('test');
          expect(actualExecutionSpy).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('anonymous functions', () => {
    it('handles anonymous functions with a default name', async () => {
      await withUseCacheUntil(async ({ cache, actualExecutionSpy }) => {
        const anonymousFunction = async (): Promise<ResultWithExpiry<string>> =>
          (await actualExecutionSpy()) as ResultWithExpiry<string>;
        Object.defineProperty(anonymousFunction, 'name', { value: null });

        const cachedAnonymousFunction = useCacheUntil(
          anonymousFunction,
          cache,
          {
            // No functionName provided
          },
        );

        await cachedAnonymousFunction();

        expect(cache.set).toHaveBeenCalledWith(
          'anonymousFunction:',
          'test',
          60000,
        );
      });
    });
  });

  describe('function name override', () => {
    it('uses the provided function name if given', async () => {
      await withUseCacheUntil(async ({ cache, testFunction }) => {
        const cachedWithCustomName = useCacheUntil(testFunction, cache, {
          functionName: 'customFunctionName',
        });

        await cachedWithCustomName();

        expect(cache.set).toHaveBeenCalledWith(
          'customFunctionName:',
          'test',
          60000,
        );
      });
    });
  });

  describe('falsy but valid cache values', () => {
    it('handles falsy but valid cache values (false, 0, empty string)', async () => {
      await withUseCacheUntil(
        async ({ cache, actualExecutionSpy, cachedTestFunction }) => {
          // First call to populate expiry map with false result
          actualExecutionSpy.mockResolvedValue({
            result: false,
            expiresAt: mockNow + 60000,
          });
          await cachedTestFunction();

          // Reset and set cache to return false
          actualExecutionSpy.mockClear();
          cache.get.mockResolvedValue(false);

          const result = await cachedTestFunction();

          expect(result).toBe(false);
          expect(actualExecutionSpy).not.toHaveBeenCalled();
        },
      );
    });

    it('executes the function when cache returns undefined', async () => {
      await withUseCacheUntil(
        async ({ cache, cachedTestFunction, actualExecutionSpy }) => {
          // First call to populate expiry map
          await cachedTestFunction();

          // Reset for second call with undefined cache
          actualExecutionSpy.mockClear();
          cache.get.mockResolvedValue(undefined);
          actualExecutionSpy.mockResolvedValue({
            result: 'fresh',
            expiresAt: mockNow + 60000,
          });

          const result = await cachedTestFunction();

          expect(result).toBe('fresh');
          expect(actualExecutionSpy).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('maintenance-aligned caching scenario', () => {
    it('caches until exact maintenance time and refetches after', async () => {
      await withUseCacheUntil(
        async ({ cache, cachedTestFunction, actualExecutionSpy }) => {
          const maintenanceTime = mockNow + 6 * 60 * 60 * 1000; // 6 hours from now

          actualExecutionSpy.mockResolvedValue({
            result: { energyFee: 420, transactionFee: 1000 },
            expiresAt: maintenanceTime,
          });

          // First call - should fetch and cache
          await cachedTestFunction();

          expect(cache.set).toHaveBeenCalledWith(
            'testFunction:',
            { energyFee: 420, transactionFee: 1000 },
            6 * 60 * 60 * 1000, // 6 hours TTL
          );

          // Advance time to just before maintenance
          jest.setSystemTime(maintenanceTime - 1000);
          actualExecutionSpy.mockClear();
          cache.get.mockResolvedValue({ energyFee: 420, transactionFee: 1000 });

          await cachedTestFunction();
          expect(actualExecutionSpy).not.toHaveBeenCalled(); // Still using cache

          // Advance time past maintenance
          jest.setSystemTime(maintenanceTime + 1000);
          actualExecutionSpy.mockResolvedValue({
            result: { energyFee: 500, transactionFee: 1200 }, // New values
            expiresAt: maintenanceTime + 6 * 60 * 60 * 1000, // Next maintenance
          });

          const freshResult = await cachedTestFunction();

          expect(actualExecutionSpy).toHaveBeenCalledTimes(1); // Fetched fresh
          expect(freshResult).toStrictEqual({
            energyFee: 500,
            transactionFee: 1200,
          });
        },
      );
    });
  });
});
