import type { IStateManager } from '@metamask/snap-networks-utils';
import { cloneDeep } from 'lodash';

import type {
  KnownCaip19ClassicAssetId,
  KnownCaip19Sep41AssetId,
} from '../../api';
import { AssetType, KnownCaip2ChainId } from '../../api';
import type {
  AssetMetadataState,
  ClassicStellarAssetMetadata,
  Sep41StellarAssetMetadata,
} from './api';
import { AssetMetadataRepository } from './AssetMetadataRepository';

const classicId =
  'stellar:testnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as KnownCaip19ClassicAssetId;

const sep41Id =
  'stellar:pubnet/sep41:CAUP7NFABXE5TJRL3FKTPMWRLC7IAXYDCTHQRFSCLR5TMGKHOOQO772J' as KnownCaip19Sep41AssetId;

function generateClassicAsset(
  chainId: KnownCaip2ChainId,
): ClassicStellarAssetMetadata {
  return {
    assetId: classicId,
    assetType: AssetType.Token,
    chainId,
    name: 'N',
    symbol: 'S',
    fungible: true,
    iconUrl: 'https://example.test/icon.png',
    units: [{ name: 'N', symbol: 'S', decimals: 7 }],
  };
}

function generateSep41Asset(
  chainId: KnownCaip2ChainId,
): Sep41StellarAssetMetadata {
  return {
    assetId: sep41Id,
    assetType: AssetType.Sep41,
    chainId,
    name: 'N',
    symbol: 'S',
    fungible: true,
    iconUrl: 'https://example.test/icon.png',
    units: [{ name: 'N', symbol: 'S', decimals: 7 }],
  };
}

/**
 *
 * @param initial
 */
function createMockStateManager(
  initial: AssetMetadataState,
): IStateManager<AssetMetadataState> {
  let state = cloneDeep(initial);
  return {
    get: async () => cloneDeep(state),
    getKey: async <TResponse>(key: string) => {
      if (key === 'assets') {
        return cloneDeep(state.assets) as TResponse;
      }
      if (key === 'assetMetadataLastSyncedAt') {
        return state.assetMetadataLastSyncedAt as TResponse;
      }
      return undefined;
    },
    setKey: jest.fn(async () => Promise.resolve()),
    setKeyWith: jest.fn(async () => Promise.resolve()),
    update: async (updater) => {
      state = updater(cloneDeep(state));
      return cloneDeep(state);
    },
    deleteKey: jest.fn(async () => Promise.resolve()),
    deleteKeys: jest.fn(async () => Promise.resolve()),
  };
}

describe('AssetMetadataRepository', () => {
  it('returns rows for getByAssetIds in request order', async () => {
    const classic = generateClassicAsset(KnownCaip2ChainId.Testnet);
    const sep41 = generateSep41Asset(KnownCaip2ChainId.Mainnet);
    const manager = createMockStateManager({
      assets: { [classicId]: classic, [sep41Id]: sep41 },
    });
    const repo = new AssetMetadataRepository(manager);

    expect(await repo.getByAssetIds([sep41Id, classicId])).toStrictEqual([
      sep41,
      classic,
    ]);
  });

  it('filters getByAssetType by assetType and chainId', async () => {
    const classic = generateClassicAsset(KnownCaip2ChainId.Testnet);
    const sep41 = generateSep41Asset(KnownCaip2ChainId.Mainnet);
    const manager = createMockStateManager({
      assets: { [classicId]: classic, [sep41Id]: sep41 },
    });
    const repo = new AssetMetadataRepository(manager);

    expect(
      await repo.getByAssetType(AssetType.Sep41, KnownCaip2ChainId.Mainnet),
    ).toStrictEqual([sep41]);
  });

  it('sets persistedAt when saving without advancing catalog sync time', async () => {
    const manager = createMockStateManager({ assets: {} });
    const repo = new AssetMetadataRepository(manager);
    const row = generateSep41Asset(KnownCaip2ChainId.Mainnet);
    const before = Date.now();

    await repo.saveMany([row]);

    const saved = await repo.getByAssetId(sep41Id);
    expect(saved).toMatchObject({
      ...row,
      persistedAt: expect.any(Number),
    });
    expect(saved?.persistedAt).toBeGreaterThanOrEqual(before);
    expect(saved?.persistedAt).toBeLessThanOrEqual(Date.now());
    expect(await manager.getKey('assetMetadataLastSyncedAt')).toBeUndefined();
  });

  it('stamps assetMetadataLastSyncedAt only for a non-empty full catalog sync', async () => {
    const manager = createMockStateManager({ assets: {} });
    const repo = new AssetMetadataRepository(manager);
    const row = generateSep41Asset(KnownCaip2ChainId.Mainnet);
    const before = Date.now();

    await repo.saveMany([row], true);

    const lastSyncedAt = await manager.getKey<number>(
      'assetMetadataLastSyncedAt',
    );
    expect(lastSyncedAt).toBeGreaterThanOrEqual(before);
    expect(lastSyncedAt).toBeLessThanOrEqual(Date.now());
  });

  it('does not stamp assetMetadataLastSyncedAt for an empty full catalog sync', async () => {
    const manager = createMockStateManager({ assets: {} });
    const repo = new AssetMetadataRepository(manager);

    await repo.saveMany([], true);

    expect(await manager.getKey('assetMetadataLastSyncedAt')).toBeUndefined();
  });

  it('resolves getByAssetId from assets map', async () => {
    const row = generateClassicAsset(KnownCaip2ChainId.Testnet);
    const manager = createMockStateManager({ assets: { [classicId]: row } });
    const repo = new AssetMetadataRepository(manager);

    expect(await repo.getByAssetId(classicId)).toStrictEqual(row);
    expect(await repo.getByAssetId(sep41Id)).toBeNull();
  });

  describe('isStale', () => {
    const oneHour = 60 * 60 * 1000;

    it('returns true when assetMetadataLastSyncedAt is missing', async () => {
      const manager = createMockStateManager({ assets: {} });
      const repo = new AssetMetadataRepository(manager);

      expect(await repo.isStale(oneHour)).toBe(true);
    });

    it('returns false when the catalog sync is within the TTL', async () => {
      const manager = createMockStateManager({
        assets: {},
        assetMetadataLastSyncedAt: Date.now(),
      });
      const repo = new AssetMetadataRepository(manager);

      expect(await repo.isStale(oneHour)).toBe(false);
    });

    it('returns true when the catalog sync is older than the TTL', async () => {
      const manager = createMockStateManager({
        assets: {},
        assetMetadataLastSyncedAt: Date.now() - (oneHour + 60 * 1000),
      });
      const repo = new AssetMetadataRepository(manager);

      expect(await repo.isStale(oneHour)).toBe(true);
    });
  });
});
