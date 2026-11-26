import type { JsonSLIP10Node } from '@metamask/key-tree';
import { SnapError } from '@metamask/snaps-sdk';
import type { EntropySource, SnapsProvider } from '@metamask/snaps-sdk';
import type { Mock } from 'vitest';

import {
  cancelBackgroundEvent,
  cancelBackgroundEventIfExists,
  createInterface,
  Duration,
  getBip32Entropy,
  getClientStatus,
  getDefaultEntropySource,
  getInterfaceContextIfExists,
  getPreferences,
  getSnapProvider,
  listEntropySources,
  resolveInterface,
  scheduleBackgroundEvent,
  showDialog,
  updateInterfaceIfExists,
  updateInterfaceWithContext,
} from './snapHelpers';
import * as SnapProviderModule from './snapProvider';

describe('snap utils', () => {
  let request: Mock<(...args: unknown[]) => Promise<unknown>>;
  let getSnapProviderSpy: Mock<() => SnapsProvider>;

  beforeEach(() => {
    request = vi.fn(async () => undefined);
    getSnapProviderSpy = vi
      .spyOn(SnapProviderModule, 'getSnapProvider')
      .mockReturnValue({ request } as unknown as SnapsProvider);
  });

  afterEach(() => {
    getSnapProviderSpy.mockRestore();
  });

  describe('Duration', () => {
    it('exposes ISO-8601 duration strings', () => {
      expect(Duration.OneSecond).toStrictEqual('PT1S');
      expect(Duration.OneHour).toStrictEqual('PT1H');
    });
  });

  describe('getSnapProvider', () => {
    it('returns the mocked Snap provider', () => {
      expect(getSnapProvider()).toStrictEqual({ request });
      expect(getSnapProviderSpy).toHaveBeenCalled();
    });
  });

  describe('getBip32Entropy', () => {
    const node = { privateKey: '00ab' } as unknown as JsonSLIP10Node;

    it('requests BIP32 entropy without a source when none is provided', async () => {
      request.mockResolvedValueOnce(node);

      await expect(
        getBip32Entropy({
          path: ['m', "44'", "144'"],
          curve: 'secp256k1',
        }),
      ).resolves.toStrictEqual(node);

      expect(request).toHaveBeenCalledWith({
        method: 'snap_getBip32Entropy',
        params: {
          path: ['m', "44'", "144'"],
          curve: 'secp256k1',
        },
      });
    });

    it('includes the entropy source when provided', async () => {
      request.mockResolvedValueOnce(node);

      await getBip32Entropy({
        entropySource: 'entropy-1',
        path: ['m', "44'", "144'"],
        curve: 'ed25519',
      });

      expect(request).toHaveBeenCalledWith({
        method: 'snap_getBip32Entropy',
        params: {
          path: ['m', "44'", "144'"],
          curve: 'ed25519',
          source: 'entropy-1',
        },
      });
    });

    it('throws a generic SnapError when the RPC call fails', async () => {
      request.mockRejectedValueOnce(new Error('secret details'));

      await expect(
        getBip32Entropy({
          path: ['m', "44'", "144'"],
          curve: 'secp256k1',
        }),
      ).rejects.toThrow(new SnapError('Failed to get BIP32 entropy from Snap'));
    });
  });

  describe('listEntropySources', () => {
    it('requests entropy sources from the Snap', async () => {
      const sources: EntropySource[] = [
        { id: 'primary', name: 'Primary', type: 'mnemonic', primary: true },
      ];
      request.mockResolvedValueOnce(sources);

      await expect(listEntropySources()).resolves.toStrictEqual(sources);
      expect(request).toHaveBeenCalledWith({
        method: 'snap_listEntropySources',
      });
    });
  });

  describe('getDefaultEntropySource', () => {
    it('returns the primary entropy source id', async () => {
      request.mockResolvedValueOnce([
        { id: 'other', name: 'Other', type: 'mnemonic', primary: false },
        { id: 'primary', name: 'Primary', type: 'mnemonic', primary: true },
      ] satisfies EntropySource[]);

      await expect(getDefaultEntropySource()).resolves.toStrictEqual('primary');
    });

    it('throws when no primary entropy source exists', async () => {
      request.mockResolvedValueOnce([
        { id: 'other', name: 'Other', type: 'mnemonic', primary: false },
      ] satisfies EntropySource[]);

      await expect(getDefaultEntropySource()).rejects.toThrow(
        'No default entropy source found',
      );
    });
  });

  describe('getClientStatus', () => {
    it('requests the client locked/unlocked status', async () => {
      request.mockResolvedValueOnce({ locked: false });

      await expect(getClientStatus()).resolves.toStrictEqual({ locked: false });
      expect(request).toHaveBeenCalledWith({
        method: 'snap_getClientStatus',
      });
    });
  });

  describe('scheduleBackgroundEvent', () => {
    it('schedules a background event with default empty params', async () => {
      request.mockResolvedValueOnce('event-id');

      await expect(
        scheduleBackgroundEvent({
          method: 'cron.tick',
          duration: Duration.OneSecond,
        }),
      ).resolves.toStrictEqual('event-id');

      expect(request).toHaveBeenCalledWith({
        method: 'snap_scheduleBackgroundEvent',
        params: {
          duration: 'PT1S',
          request: {
            method: 'cron.tick',
            params: {},
          },
        },
      });
    });

    it('forwards custom params', async () => {
      request.mockResolvedValueOnce('event-id');

      await scheduleBackgroundEvent({
        method: 'cron.tick',
        params: { interfaceId: 'ui-1' },
        duration: Duration.FiveSeconds,
      });

      expect(request).toHaveBeenCalledWith({
        method: 'snap_scheduleBackgroundEvent',
        params: {
          duration: 'PT5S',
          request: {
            method: 'cron.tick',
            params: { interfaceId: 'ui-1' },
          },
        },
      });
    });
  });

  describe('cancelBackgroundEvent', () => {
    it('cancels a background event by id', async () => {
      await cancelBackgroundEvent('event-id');

      expect(request).toHaveBeenCalledWith({
        method: 'snap_cancelBackgroundEvent',
        params: { id: 'event-id' },
      });
    });
  });

  describe('cancelBackgroundEventIfExists', () => {
    it('no-ops when the id is missing', async () => {
      await cancelBackgroundEventIfExists(undefined);

      expect(request).not.toHaveBeenCalled();
    });

    it('cancels when an id is present', async () => {
      await cancelBackgroundEventIfExists('event-id');

      expect(request).toHaveBeenCalledWith({
        method: 'snap_cancelBackgroundEvent',
        params: { id: 'event-id' },
      });
    });

    it('swallows cancel failures', async () => {
      request.mockRejectedValueOnce(new Error('already executed'));

      await expect(
        cancelBackgroundEventIfExists('event-id'),
      ).resolves.toBeUndefined();
    });
  });

  describe('createInterface', () => {
    it('creates an interface with ui and context', async () => {
      request.mockResolvedValueOnce('interface-id');
      const ui = { type: 'Box' } as never;

      await expect(
        createInterface(ui, { step: 'confirm' }),
      ).resolves.toStrictEqual('interface-id');

      expect(request).toHaveBeenCalledWith({
        method: 'snap_createInterface',
        params: {
          ui,
          context: { step: 'confirm' },
        },
      });
    });
  });

  describe('updateInterfaceIfExists', () => {
    const ui = { type: 'Box' } as never;

    it('returns true when the update succeeds', async () => {
      await expect(
        updateInterfaceIfExists('interface-id', ui, { step: 'next' }),
      ).resolves.toBe(true);

      expect(request).toHaveBeenCalledWith({
        method: 'snap_updateInterface',
        params: {
          id: 'interface-id',
          ui,
          context: { step: 'next' },
        },
      });
    });

    it('returns null when the interface was dismissed', async () => {
      request.mockRejectedValueOnce(new Error('Interface not found'));

      await expect(updateInterfaceIfExists('gone', ui, {})).resolves.toBeNull();
    });

    it('rethrows unrelated update errors', async () => {
      request.mockRejectedValueOnce(new Error('network down'));

      await expect(updateInterfaceIfExists('id', ui, {})).rejects.toThrow(
        'network down',
      );
    });
  });

  describe('getInterfaceContextIfExists', () => {
    it('returns the interface context', async () => {
      request.mockResolvedValueOnce({ step: 'confirm' });

      await expect(
        getInterfaceContextIfExists<{ step: string }>('interface-id'),
      ).resolves.toStrictEqual({ step: 'confirm' });

      expect(request).toHaveBeenCalledWith({
        method: 'snap_getInterfaceContext',
        params: { id: 'interface-id' },
      });
    });

    it('returns null when the context is empty', async () => {
      request.mockResolvedValueOnce(null);

      await expect(getInterfaceContextIfExists('id')).resolves.toBeNull();
    });

    it('returns null when the interface was dismissed', async () => {
      request.mockRejectedValueOnce(new Error('The interface was not found'));

      await expect(getInterfaceContextIfExists('gone')).resolves.toBeNull();
    });

    it('rethrows unrelated context errors', async () => {
      request.mockRejectedValueOnce(new Error('rpc failed'));

      await expect(getInterfaceContextIfExists('id')).rejects.toThrow(
        'rpc failed',
      );
    });
  });

  describe('updateInterfaceWithContext', () => {
    it('updates an interface with ui and context', async () => {
      request.mockResolvedValueOnce(null);
      const ui = { type: 'Box' } as never;

      await expect(
        updateInterfaceWithContext('interface-id', ui, { step: 'done' }),
      ).resolves.toBeNull();

      expect(request).toHaveBeenCalledWith({
        method: 'snap_updateInterface',
        params: {
          id: 'interface-id',
          ui,
          context: { step: 'done' },
        },
      });
    });
  });

  describe('showDialog', () => {
    it('shows a custom dialog when type is omitted', async () => {
      request.mockResolvedValueOnce(true);

      await expect(showDialog('interface-id')).resolves.toBe(true);
      expect(request).toHaveBeenCalledWith({
        method: 'snap_dialog',
        params: { id: 'interface-id' },
      });
    });

    it('includes an explicit dialog type', async () => {
      request.mockResolvedValueOnce(true);

      await showDialog('interface-id', 'confirmation');

      expect(request).toHaveBeenCalledWith({
        method: 'snap_dialog',
        params: {
          type: 'confirmation',
          id: 'interface-id',
        },
      });
    });
  });

  describe('resolveInterface', () => {
    it('resolves an interface with a value', async () => {
      request.mockResolvedValueOnce(null);

      await expect(
        resolveInterface('interface-id', { confirmed: true }),
      ).resolves.toBeNull();

      expect(request).toHaveBeenCalledWith({
        method: 'snap_resolveInterface',
        params: {
          id: 'interface-id',
          value: { confirmed: true },
        },
      });
    });
  });

  describe('getPreferences', () => {
    it('requests snap preferences', async () => {
      const preferences = {
        locale: 'en',
        currency: 'usd',
        hideBalances: false,
        useSecurityAlerts: true,
        simulateOnChainActions: true,
        useTokenDetection: true,
        batchCheckBalances: true,
        displayNftMedia: true,
        useNftDetection: true,
        useExternalPricingData: true,
        showTestnets: false,
      };
      request.mockResolvedValueOnce(preferences);

      await expect(getPreferences()).resolves.toStrictEqual(preferences);
      expect(request).toHaveBeenCalledWith({
        method: 'snap_getPreferences',
      });
    });
  });
});
