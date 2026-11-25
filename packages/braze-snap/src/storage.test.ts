import { stubSnap } from '../tests/snap';
import { STORAGE_STATE_KEY } from './constants';
import {
  commitStorage,
  hydrateStorage,
  resetStorage,
  snapStorage,
  storageShim,
} from './storage';

const KEY = 'ab.storage.deviceId.api-key';

describe('storage', () => {
  beforeEach(() => {
    resetStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('storageShim', () => {
    it('implements the Storage methods the SDK uses', () => {
      storageShim.setItem('a', 'one');
      storageShim.setItem('b', 2 as unknown as string);

      expect(storageShim).toHaveLength(2);
      expect(storageShim.key(1)).toBe('b');
      expect(storageShim.key(2)).toBeNull();
      expect(storageShim.getItem('b')).toBe('2');
      expect(storageShim.getItem('missing')).toBeNull();

      storageShim.removeItem('a');
      expect(storageShim.getItem('a')).toBeNull();

      storageShim.clear();
      expect(storageShim).toHaveLength(0);
    });
  });

  describe('hydrateStorage', () => {
    it('loads the persisted items', async () => {
      stubSnap({
        [STORAGE_STATE_KEY]: { version: 1, items: { [KEY]: 'device' } },
      });

      await hydrateStorage();

      expect(storageShim.getItem(KEY)).toBe('device');
    });

    it('reads snap state unencrypted and only once', async () => {
      const { request } = stubSnap();

      await hydrateStorage();
      await hydrateStorage();

      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith({
        method: 'snap_getState',
        params: { key: STORAGE_STATE_KEY, encrypted: false },
      });
    });

    it.each([
      ['null', null],
      ['a string', 'items'],
      ['an unknown version', { version: 2, items: { [KEY]: 'device' } }],
      ['missing items', { version: 1 }],
      ['non-object items', { version: 1, items: [] }],
    ])('starts empty when the state is %s', async (_, value) => {
      stubSnap({ [STORAGE_STATE_KEY]: value });
      storageShim.setItem(KEY, 'stale');

      await hydrateStorage();

      expect(storageShim).toHaveLength(0);
    });

    it('drops items that are not strings or not persisted keys', async () => {
      stubSnap({
        [STORAGE_STATE_KEY]: {
          version: 1,
          items: {
            [KEY]: 'device',
            'ab.test': 'true',
            'ab.storage.triggers': '[]',
            'ab.storage.triggers.ts': '1',
            'ab.storage.x': 1,
            'metamask.y': 2,
          },
        },
      });

      await hydrateStorage();

      expect(storageShim).toHaveLength(1);
      expect(storageShim.getItem(KEY)).toBe('device');
      expect(snapStorage.getItem('y')).toBeNull();
    });

    it('loads the snap items out of the SDK storage', async () => {
      stubSnap({
        [STORAGE_STATE_KEY]: {
          version: 1,
          items: { [KEY]: 'device', 'metamask.language': 'fr' },
        },
      });

      await hydrateStorage();

      expect(snapStorage.getItem('language')).toBe('fr');
      expect(storageShim).toHaveLength(1);
      expect(storageShim.getItem('metamask.language')).toBeNull();
    });
  });

  describe('commitStorage', () => {
    it('persists the SDK storage keys, sorted, in one unencrypted write', async () => {
      const { request, state } = stubSnap();
      await hydrateStorage();

      storageShim.setItem('ab.storage.b', '2');
      storageShim.setItem('ab.test', 'true');
      storageShim.setItem('ab.storage.a', '1');
      storageShim.setItem('ab.storage.a', '3');
      await commitStorage();

      expect(request).toHaveBeenCalledTimes(2);
      expect(request).toHaveBeenLastCalledWith({
        method: 'snap_setState',
        params: {
          key: STORAGE_STATE_KEY,
          value: {
            version: 1,
            items: { 'ab.storage.a': '3', 'ab.storage.b': '2' },
          },
          encrypted: false,
        },
      });
      expect(
        Object.keys((state.get(STORAGE_STATE_KEY) as { items: object }).items),
      ).toStrictEqual(['ab.storage.a', 'ab.storage.b']);
    });

    it('persists the snap items with the SDK storage keys', async () => {
      const { state } = stubSnap();
      await hydrateStorage();

      storageShim.setItem(KEY, 'device');
      snapStorage.setItem('language', 'fr');
      await commitStorage();

      expect(state.get(STORAGE_STATE_KEY)).toStrictEqual({
        version: 1,
        items: { [KEY]: 'device', 'metamask.language': 'fr' },
      });
    });

    it('keeps the in-app message triggers in memory only', async () => {
      const { state } = stubSnap();
      await hydrateStorage();

      storageShim.setItem(KEY, 'device');
      storageShim.setItem('ab.storage.triggers', '[]');
      storageShim.setItem('ab.storage.triggers.ts', '1');
      await commitStorage();

      expect(state.get(STORAGE_STATE_KEY)).toStrictEqual({
        version: 1,
        items: { [KEY]: 'device' },
      });
      expect(storageShim.getItem('ab.storage.triggers')).toBe('[]');
    });

    it('does not write when nothing persisted changed', async () => {
      const { request } = stubSnap({
        [STORAGE_STATE_KEY]: { version: 1, items: { [KEY]: 'device' } },
      });
      await hydrateStorage();

      storageShim.setItem('ab.test', 'true');
      storageShim.removeItem(KEY);
      storageShim.setItem(KEY, 'device');
      await commitStorage();

      expect(request).toHaveBeenCalledTimes(1);
    });

    it('does not write the same content twice', async () => {
      const { request } = stubSnap();
      await hydrateStorage();

      storageShim.setItem(KEY, 'device');
      await commitStorage();
      await commitStorage();

      expect(request).toHaveBeenCalledTimes(2);
    });
  });

  describe('resetStorage', () => {
    it('clears memory and reads snap state again on the next hydrate', async () => {
      const { request } = stubSnap({
        [STORAGE_STATE_KEY]: { version: 1, items: { [KEY]: 'device' } },
      });
      await hydrateStorage();
      storageShim.setItem('ab.storage.other', 'value');
      snapStorage.setItem('language', 'fr');

      resetStorage();
      expect(storageShim).toHaveLength(0);
      expect(snapStorage.getItem('language')).toBeNull();

      await hydrateStorage();
      expect(request).toHaveBeenCalledTimes(2);
      expect(storageShim.getItem(KEY)).toBe('device');
      expect(storageShim.getItem('ab.storage.other')).toBeNull();
    });
  });
});
