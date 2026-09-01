import type { Serializable } from '@metamask/snap-networks-utils';

export type TimestampMilliseconds = number;

/**
 * A single cache entry.
 */
export type CacheEntry = {
  value: Serializable;
  expiresAt: TimestampMilliseconds;
};
