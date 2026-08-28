import type { Serializable } from '@metamask/snap-networks-utils';

import type { ICache } from './ICache';
import { CacheOptions, useCache } from './useCache';

// Define common cache options
const cacheOptions: CacheOptions = {
  ttlMilliseconds: 1000,
  functionName: 'testFunction',
};

type WithUseCacheCallback = (payload: {
  actualExecutionSpy: jest.Mock<Promise<string>, Serializable[]>;
  cache: ICache<Serializable>;
  testFunction: () => Promise<string>;
  cachedTestFunction: () => Promise<string>;
  cachedTestFunctionWithArgs: (arg1: string, arg2: number) => Promise<string>;
  cachedTestFunctionWithComplexArgs: (obj: {
    name: string;
    age: number;
  }) => Promise<string>;
}) => void | Promise<void>;

/**
 * Wraps tests for `useCache` by creating fresh cached functions backed by a
 * mock cache.
 *
 * @param testFn - The test body receiving the cached functions.
 * @returns A promise that resolves when the test function completes.
 */
async function withUseCache(testFn: WithUseCacheCallback): Promise<void> {
  // Reset mocks for each test
  const actualExecutionSpy = jest
    .fn<Promise<string>, Serializable[]>()
    .mockResolvedValue('test');

  // Create a mock cache
  const cache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
  } as unknown as ICache<Serializable>;

  // Define original functions
  const testFunction = async (): Promise<string> => actualExecutionSpy();
  const testFunctionWithArgs = async (
    arg1: string,
    arg2: number,
  ): Promise<string> => actualExecutionSpy(arg1, arg2);
  const testFunctionWithComplexArgs = async (obj: {
    name: string;
    age: number;
  }): Promise<string> => actualExecutionSpy(obj);

  // Create cached versions
  const cachedTestFunction = useCache(testFunction, cache, {
    ...cacheOptions,
    functionName: 'testFunction',
  });

  const cachedTestFunctionWithArgs = useCache(testFunctionWithArgs, cache, {
    ...cacheOptions,
    functionName: 'testFunctionWithArgs',
  });

  const cachedTestFunctionWithComplexArgs = useCache(
    testFunctionWithComplexArgs,
    cache,
    {
      ...cacheOptions,
      functionName: 'testFunctionWithComplexArgs',
    },
  );

  await testFn({
    actualExecutionSpy,
    cache,
    testFunction,
    cachedTestFunction,
    cachedTestFunctionWithArgs,
    cachedTestFunctionWithComplexArgs,
  });
}

describe('useCache', () => {
  describe('when the data is not cached', () => {
    it('should cache the result of a function', async () => {
      await withUseCache(
        async ({ actualExecutionSpy, cache, cachedTestFunction }) => {
          // No cached data
          cache.get.mockResolvedValue(undefined);

          const result = await cachedTestFunction();

          expect(result).toBe('test');
          expect(cache.get).toHaveBeenCalledTimes(1);
          expect(actualExecutionSpy).toHaveBeenCalledTimes(1);
          expect(cache.set).toHaveBeenCalledWith('testFunction:', 'test', 1000);
        },
      );
    });
  });

  describe('when the data is cached', () => {
    it('should return the cached result', async () => {
      await withUseCache(
        async ({ actualExecutionSpy, cache, cachedTestFunction }) => {
          // Init the cache with some data
          cache.get.mockResolvedValue('test');
          // jest.spyOn(cache, 'get').mockResolvedValue('test');

          const result = await cachedTestFunction();

          expect(result).toBe('test');
          expect(cache.get).toHaveBeenCalledTimes(1);
          expect(actualExecutionSpy).not.toHaveBeenCalled();
          expect(cache.set).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('error handling', () => {
    it('should propagate errors from the original function', async () => {
      await withUseCache(
        async ({ actualExecutionSpy, cachedTestFunction, cache }) => {
          const error = new Error('Test error');
          actualExecutionSpy.mockRejectedValueOnce(error);

          await expect(cachedTestFunction()).rejects.toThrow('Test error');
          expect(cache.set).not.toHaveBeenCalled();
        },
      );
    });

    it('should handle cache get errors gracefully', async () => {
      await withUseCache(
        async ({ actualExecutionSpy, cachedTestFunction, cache }) => {
          cache.get.mockRejectedValueOnce(new Error('Cache error'));
          actualExecutionSpy.mockResolvedValueOnce('test');

          const result = await cachedTestFunction();

          expect(result).toBe('test');
          expect(actualExecutionSpy).toHaveBeenCalledTimes(1);
          expect(cache.set).toHaveBeenCalledWith('testFunction:', 'test', 1000);
        },
      );
    });

    it('should handle cache set errors gracefully', async () => {
      await withUseCache(
        async ({ actualExecutionSpy, cachedTestFunction, cache }) => {
          cache.get.mockResolvedValue(undefined);
          cache.set.mockRejectedValueOnce(new Error('Cache set error'));
          actualExecutionSpy.mockResolvedValueOnce('test');

          const result = await cachedTestFunction();

          expect(result).toBe('test');
          expect(actualExecutionSpy).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('different argument types', () => {
    it('should handle primitive arguments correctly', async () => {
      await withUseCache(
        async ({ actualExecutionSpy, cache, cachedTestFunctionWithArgs }) => {
          cache.get.mockResolvedValue(undefined);
          cache.set.mockResolvedValueOnce(undefined);
          actualExecutionSpy.mockResolvedValueOnce('test with args');

          const result = await cachedTestFunctionWithArgs('hello', 42);

          expect(result).toBe('test with args');
          expect(cache.get).toHaveBeenCalledWith(
            'testFunctionWithArgs:"hello":42',
          );
          expect(actualExecutionSpy).toHaveBeenCalledWith('hello', 42);
        },
      );
    });

    it('should handle complex object arguments correctly', async () => {
      await withUseCache(
        async ({
          actualExecutionSpy,
          cache,
          cachedTestFunctionWithComplexArgs,
        }) => {
          cache.get.mockResolvedValue(undefined);
          cache.set.mockResolvedValueOnce(undefined);
          actualExecutionSpy.mockResolvedValueOnce('test with complex args');

          const testObj = { name: 'John', age: 30 };
          const result = await cachedTestFunctionWithComplexArgs(testObj);

          expect(result).toBe('test with complex args');
          expect(cache.get).toHaveBeenCalledWith(
            'testFunctionWithComplexArgs:{"name":"John","age":30}',
          );
          expect(actualExecutionSpy).toHaveBeenCalledWith(testObj);
        },
      );
    });
  });

  describe('custom generateCacheKey', () => {
    it('should use a custom key generator if provided', async () => {
      await withUseCache(async ({ cache, testFunction }) => {
        const customKeyGenerator = jest.fn().mockReturnValue('custom-key');

        const customCachedFunction = useCache(testFunction, cache, {
          ...cacheOptions,
          generateCacheKey: customKeyGenerator,
        });

        await customCachedFunction();

        expect(customKeyGenerator).toHaveBeenCalledTimes(1);
        expect(cache.get).toHaveBeenCalledWith('custom-key');
      });
    });
  });

  describe('anonymous functions', () => {
    it('should handle anonymous functions with a default name', async () => {
      await withUseCache(async ({ actualExecutionSpy, cache }) => {
        // Anonymous function with no name
        const anonymousFunction = async (): Promise<string> =>
          actualExecutionSpy();
        Object.defineProperty(anonymousFunction, 'name', { value: null });

        const cachedAnonymousFunction = useCache(anonymousFunction, cache, {
          ttlMilliseconds: 1000,
        });

        await cachedAnonymousFunction();

        expect(cache.get).toHaveBeenCalledWith('anonymousFunction:');
      });
    });
  });

  describe('function name override', () => {
    it('should use the provided function name if given', async () => {
      await withUseCache(async ({ testFunction, cache }) => {
        const cachedWithCustomName = useCache(testFunction, cache, {
          ttlMilliseconds: 1000,
          functionName: 'customFunctionName',
        });

        await cachedWithCustomName();

        expect(cache.get).toHaveBeenCalledWith('customFunctionName:');
      });
    });
  });

  describe('falsy but valid cache values', () => {
    it('should handle falsy but valid cache values (false, 0, empty string)', async () => {
      await withUseCache(
        async ({ actualExecutionSpy, cache, cachedTestFunction }) => {
          // Test with false
          cache.get.mockResolvedValue(false);
          let result = await cachedTestFunction();
          expect(result).toBe(false);
          expect(actualExecutionSpy).not.toHaveBeenCalled();

          // Test with 0
          cache.get.mockResolvedValue(0);
          result = await cachedTestFunction();
          expect(result).toBe(0);
          expect(actualExecutionSpy).not.toHaveBeenCalled();

          // Test with empty string
          cache.get.mockResolvedValue('');
          result = await cachedTestFunction();
          expect(result).toBe('');
          expect(actualExecutionSpy).not.toHaveBeenCalled();
        },
      );
    });

    it('should execute the function when cache returns undefined', async () => {
      await withUseCache(
        async ({ actualExecutionSpy, cache, cachedTestFunction }) => {
          cache.get.mockResolvedValue(undefined);
          actualExecutionSpy.mockResolvedValueOnce('test');

          const result = await cachedTestFunction();

          expect(result).toBe('test');
          expect(actualExecutionSpy).toHaveBeenCalledTimes(1);
        },
      );
    });
  });
});
