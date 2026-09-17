import type {
  CacheOptions,
  ICache,
  Serializable,
} from '@metamask/snap-networks-utils';
import { useCache as useCacheShared } from '@metamask/snap-networks-utils';

import logger from './logger';

/**
 * Wraps a function with caching behavior, defaulting to the snap logger for
 * cache errors, like the snap's original `useCache` implementation did.
 *
 * @template TArgs - Tuple type representing the arguments of the function.
 * @template TResult - The return type of the function, must be Serializable.
 * @param fn - The asynchronous function to wrap.
 * @param cache - The cache instance to use.
 * @param options - The caching options.
 * @returns A new asynchronous function with caching behavior.
 */
export const useCache = <
  TArgs extends Serializable[],
  TResult extends Serializable,
>(
  fn: (...args: TArgs) => Promise<TResult>,
  cache: ICache<Serializable>,
  options: CacheOptions,
): ((...args: TArgs) => Promise<TResult>) =>
  useCacheShared(fn, cache, { ...options, logger: options.logger ?? logger });
