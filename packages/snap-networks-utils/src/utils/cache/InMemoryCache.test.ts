import { Logger, LogLevel } from '../logger/Logger';
import { InMemoryCache } from './InMemoryCache';

describe('InMemoryCache', () => {
  let logger: Logger;

  const JAN_1_2024 = 1704067200000;

  beforeEach(() => {
    logger = new Logger({ level: LogLevel.SILENT });
  });

  describe('get', () => {
    it('returns the cached value if present and not expired', async () => {
      const cache = new InMemoryCache(logger);
      await cache.set('key', 'value');

      expect(await cache.get('key')).toBe('value');
    });

    it('returns undefined if the key is not present', async () => {
      const cache = new InMemoryCache(logger);

      expect(await cache.get('key')).toBeUndefined();
    });

    it('returns undefined and removes the entry if it is expired', async () => {
      const cache = new InMemoryCache(logger);
      const mockDateNow = jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(JAN_1_2024);

      await cache.set('key', 'value', 1000);
      mockDateNow.mockReturnValue(JAN_1_2024 + 1001);

      expect(await cache.get('key')).toBeUndefined();
      expect(await cache.size()).toBe(0);

      mockDateNow.mockRestore();
    });
  });

  describe('set', () => {
    it('stores the value with the default ttl if none is provided', async () => {
      const cache = new InMemoryCache(logger);
      const mockDateNow = jest.spyOn(Date, 'now').mockReturnValue(JAN_1_2024);

      await cache.set('key', 'value');

      expect(await cache.peek('key')).toBe('value');
      expect(await cache.keys()).toHaveLength(1);

      mockDateNow.mockRestore();
    });

    it('stores the value with the provided ttl', async () => {
      const cache = new InMemoryCache(logger);
      const mockDateNow = jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(JAN_1_2024);

      await cache.set('key', 'value', 1000);

      mockDateNow.mockReturnValue(JAN_1_2024 + 999);
      expect(await cache.get('key')).toBe('value');

      mockDateNow.mockReturnValue(JAN_1_2024 + 1000);
      expect(await cache.get('key')).toBe('value');

      mockDateNow.mockReturnValue(JAN_1_2024 + 1001);
      expect(await cache.get('key')).toBeUndefined();

      mockDateNow.mockRestore();
    });

    it('clamps the expiry to the maximum safe integer', async () => {
      const cache = new InMemoryCache(logger);

      await cache.set('key', 'value', Number.MAX_SAFE_INTEGER);

      expect(await cache.get('key')).toBe('value');
    });

    it('supports a ttl of 0', async () => {
      const cache = new InMemoryCache(logger);
      const mockDateNow = jest.spyOn(Date, 'now').mockReturnValue(JAN_1_2024);

      await cache.set('key', 'value', 0);

      expect(await cache.get('key')).toBe('value');

      mockDateNow.mockReturnValue(JAN_1_2024 + 1);
      expect(await cache.get('key')).toBeUndefined();

      mockDateNow.mockRestore();
    });

    it('throws an error if the ttl is not a number', async () => {
      const cache = new InMemoryCache(logger);

      await expect(
        cache.set('key', 'value', 'not a number' as unknown as number),
      ).rejects.toThrow('TTL must be a number');
    });

    it('throws an error if the ttl is negative', async () => {
      const cache = new InMemoryCache(logger);

      await expect(cache.set('key', 'value', -1)).rejects.toThrow(
        'TTL must be positive',
      );
    });

    it('throws an error if the ttl is too large', async () => {
      const cache = new InMemoryCache(logger);

      await expect(
        cache.set('key', 'value', Number.MAX_SAFE_INTEGER + 1),
      ).rejects.toThrow('TTL must be less than 2^53 - 1');
    });
  });

  describe('delete', () => {
    it('returns true if the key was present', async () => {
      const cache = new InMemoryCache(logger);
      await cache.set('key', 'value');

      expect(await cache.delete('key')).toBe(true);
      expect(await cache.get('key')).toBeUndefined();
    });

    it('returns false if the key was not present', async () => {
      const cache = new InMemoryCache(logger);

      expect(await cache.delete('key')).toBe(false);
    });

    it('returns false if the mdelete result does not include the key', async () => {
      const cache = new InMemoryCache(logger);
      await cache.set('key', 'value');
      jest.spyOn(cache, 'mdelete').mockResolvedValue({});

      expect(await cache.delete('key')).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all entries', async () => {
      const cache = new InMemoryCache(logger);
      await cache.set('key', 'value');
      await cache.set('otherKey', 'otherValue');

      await cache.clear();

      expect(await cache.size()).toBe(0);
      expect(await cache.get('key')).toBeUndefined();
      expect(await cache.get('otherKey')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('returns true if the key is present and not expired', async () => {
      const cache = new InMemoryCache(logger);
      await cache.set('key', 'value');

      expect(await cache.has('key')).toBe(true);
    });

    it('returns false if the key is not present', async () => {
      const cache = new InMemoryCache(logger);

      expect(await cache.has('key')).toBe(false);
    });

    it('returns false and removes the entry if it is expired', async () => {
      const cache = new InMemoryCache(logger);
      const mockDateNow = jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(JAN_1_2024);

      await cache.set('key', 'value', 1000);
      mockDateNow.mockReturnValue(JAN_1_2024 + 1001);

      expect(await cache.has('key')).toBe(false);
      expect(await cache.size()).toBe(0);

      mockDateNow.mockRestore();
    });
  });

  describe('keys', () => {
    it('returns all keys in the cache', async () => {
      const cache = new InMemoryCache(logger);
      await cache.set('key', 'value');
      await cache.set('otherKey', 'otherValue');

      expect(await cache.keys()).toStrictEqual(['key', 'otherKey']);
    });

    it('removes expired entries before returning the keys', async () => {
      const cache = new InMemoryCache(logger);
      const mockDateNow = jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(JAN_1_2024)
        .mockReturnValueOnce(JAN_1_2024);

      await cache.set('key', 'value', 1000);
      await cache.set('otherKey', 'otherValue', 5000);

      mockDateNow.mockReturnValue(JAN_1_2024 + 1001);

      expect(await cache.keys()).toStrictEqual(['otherKey']);

      mockDateNow.mockRestore();
    });

    it('returns an empty array if the cache is empty', async () => {
      const cache = new InMemoryCache(logger);

      expect(await cache.keys()).toStrictEqual([]);
    });
  });

  describe('size', () => {
    it('returns the number of items in the cache', async () => {
      const cache = new InMemoryCache(logger);
      await cache.set('key', 'value');
      await cache.set('otherKey', 'otherValue');

      expect(await cache.size()).toBe(2);
    });

    it('removes expired entries before returning the size', async () => {
      const cache = new InMemoryCache(logger);
      const mockDateNow = jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(JAN_1_2024)
        .mockReturnValueOnce(JAN_1_2024);

      await cache.set('key', 'value', 1000);
      await cache.set('otherKey', 'otherValue', 5000);

      mockDateNow.mockReturnValue(JAN_1_2024 + 1001);

      expect(await cache.size()).toBe(1);

      mockDateNow.mockRestore();
    });

    it('returns 0 if the cache is empty', async () => {
      const cache = new InMemoryCache(logger);

      expect(await cache.size()).toBe(0);
    });
  });

  describe('peek', () => {
    it('returns the value without removing the entry', async () => {
      const cache = new InMemoryCache(logger);
      await cache.set('key', 'value');

      expect(await cache.peek('key')).toBe('value');
      expect(await cache.size()).toBe(1);
    });

    it('returns undefined if the key is not present', async () => {
      const cache = new InMemoryCache(logger);

      expect(await cache.peek('key')).toBeUndefined();
    });

    it('returns undefined and removes the entry if it is expired', async () => {
      const cache = new InMemoryCache(logger);
      const mockDateNow = jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(JAN_1_2024);

      await cache.set('key', 'value', 1000);
      mockDateNow.mockReturnValue(JAN_1_2024 + 1001);

      expect(await cache.peek('key')).toBeUndefined();
      expect(await cache.size()).toBe(0);

      mockDateNow.mockRestore();
    });
  });

  describe('mget', () => {
    it('returns the values for the given keys', async () => {
      const cache = new InMemoryCache(logger);
      await cache.set('key', 'value');
      await cache.set('otherKey', 'otherValue');

      expect(await cache.mget(['key', 'otherKey'])).toStrictEqual({
        key: 'value',
        otherKey: 'otherValue',
      });
    });

    it('returns undefined for keys that are not present', async () => {
      const cache = new InMemoryCache(logger);
      await cache.set('key', 'value');

      expect(await cache.mget(['key', 'otherKey'])).toStrictEqual({
        key: 'value',
        otherKey: undefined,
      });
    });

    it('removes expired entries before reading', async () => {
      const cache = new InMemoryCache(logger);
      const mockDateNow = jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(JAN_1_2024);

      await cache.set('key', 'value', 1000);
      mockDateNow.mockReturnValue(JAN_1_2024 + 1001);

      expect(await cache.mget(['key'])).toStrictEqual({ key: undefined });
      expect(await cache.size()).toBe(0);

      mockDateNow.mockRestore();
    });
  });

  describe('mset', () => {
    it('no-ops if no entries are provided', async () => {
      const cache = new InMemoryCache(logger);

      await cache.mset([]);

      expect(await cache.size()).toBe(0);
    });

    it('defers to set if there is only one entry', async () => {
      const cache = new InMemoryCache(logger);
      const setSpy = jest.spyOn(cache, 'set');

      await cache.mset([{ key: 'key', value: 'value', ttlMilliseconds: 1000 }]);

      expect(setSpy).toHaveBeenCalledWith('key', 'value', 1000);
      expect(await cache.get('key')).toBe('value');
    });

    it('defers to set with an undefined ttl if there is only one entry without ttl', async () => {
      const cache = new InMemoryCache(logger);
      const setSpy = jest.spyOn(cache, 'set');

      await cache.mset([{ key: 'key', value: 'value' }]);

      expect(setSpy).toHaveBeenCalledWith('key', 'value', undefined);
      expect(await cache.get('key')).toBe('value');
    });

    it('stores multiple entries', async () => {
      const cache = new InMemoryCache(logger);

      await cache.mset([
        { key: 'key', value: 'value' },
        { key: 'otherKey', value: 'otherValue' },
      ]);

      expect(await cache.mget(['key', 'otherKey'])).toStrictEqual({
        key: 'value',
        otherKey: 'otherValue',
      });
    });

    it('does not store undefined values', async () => {
      const cache = new InMemoryCache(logger);

      await cache.mset([
        { key: 'key', value: 'value' },
        { key: 'undefinedKey', value: undefined },
      ]);

      expect(await cache.mget(['key', 'undefinedKey'])).toStrictEqual({
        key: 'value',
        undefinedKey: undefined,
      });
      expect(await cache.size()).toBe(1);
    });

    it('stores null values', async () => {
      const cache = new InMemoryCache(logger);

      await cache.mset([{ key: 'key', value: null }]);

      expect(await cache.mget(['key'])).toStrictEqual({ key: null });
    });

    it('stores entries with the provided ttl', async () => {
      const cache = new InMemoryCache(logger);
      const mockDateNow = jest.spyOn(Date, 'now').mockReturnValue(JAN_1_2024);

      await cache.mset([
        { key: 'key', value: 'value', ttlMilliseconds: 1000 },
        { key: 'otherKey', value: 'otherValue' },
      ]);

      mockDateNow.mockReturnValue(JAN_1_2024 + 1001);

      expect(await cache.mget(['key', 'otherKey'])).toStrictEqual({
        key: undefined,
        otherKey: 'otherValue',
      });

      mockDateNow.mockRestore();
    });

    it('throws an error if any ttl is invalid', async () => {
      const cache = new InMemoryCache(logger);

      await expect(
        cache.mset([
          { key: 'key', value: 'value' },
          {
            key: 'otherKey',
            value: 'otherValue',
            ttlMilliseconds: 'not a number' as unknown as number,
          },
        ]),
      ).rejects.toThrow('TTL must be a number');
    });
  });

  describe('mdelete', () => {
    it('deletes the given keys and reports which ones were removed', async () => {
      const cache = new InMemoryCache(logger);
      await cache.set('key', 'value');
      await cache.set('otherKey', 'otherValue');

      const result = await cache.mdelete(['key', 'otherKey', 'missingKey']);

      expect(result).toStrictEqual({
        key: true,
        otherKey: true,
        missingKey: false,
      });
      expect(await cache.size()).toBe(0);
    });

    it('returns an empty object if no keys are provided', async () => {
      const cache = new InMemoryCache(logger);

      expect(await cache.mdelete([])).toStrictEqual({});
    });
  });
});
