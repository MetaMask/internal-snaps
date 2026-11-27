import type { IStateManager } from '@metamask/snap-networks-utils';
import { cloneDeep } from 'lodash';

import { AssetType, KnownCaip2ChainId } from '../../api';
import { IOU_DECIMAL_PLACES } from '../../constants';
import { USDC_IOU, USDC_MPT } from './__mocks__/assets.fixtures';
import type {
  AssetMetadataState,
  IouXrplAssetMetadata,
  MptXrplAssetMetadata,
} from './api';
import { AssetMetadataRepository } from './AssetMetadataRepository';

const iouId = USDC_IOU;
const mptId = USDC_MPT;

function generateIouAsset(chainId: KnownCaip2ChainId): IouXrplAssetMetadata {
  return {
    assetId: iouId,
    assetType: AssetType.Token,
    chainId,
    name: 'N',
    symbol: 'S',
    fungible: true,
    iconUrl: 'https://example.test/icon.png',
    units: [{ name: 'N', symbol: 'S', decimals: IOU_DECIMAL_PLACES }],
  };
}

function generateMptAsset(chainId: KnownCaip2ChainId): MptXrplAssetMetadata {
  return {
    assetId: mptId,
    assetType: AssetType.Mpt,
    chainId,
    name: 'N',
    symbol: 'S',
    fungible: true,
    iconUrl: 'https://example.test/icon.png',
    units: [{ name: 'N', symbol: 'S', decimals: 6 }],
  };
}

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
      // eslint-disable-next-line unicorn/no-useless-undefined
      return undefined;
    },
    setKey: vi.fn(async () => Promise.resolve()),
    setKeyWith: vi.fn(async () => Promise.resolve()),
    update: async (updater) => {
      state = updater(cloneDeep(state));
      return cloneDeep(state);
    },
    deleteKey: vi.fn(async () => Promise.resolve()),
    deleteKeys: vi.fn(async () => Promise.resolve()),
  };
}

describe('AssetMetadataRepository', () => {
  it('returns rows for getByAssetIds in request order', async () => {
    const iou = generateIouAsset(KnownCaip2ChainId.Mainnet);
    const mpt = generateMptAsset(KnownCaip2ChainId.Mainnet);
    const manager = createMockStateManager({
      assets: { [iouId]: iou, [mptId]: mpt },
    });
    const repo = new AssetMetadataRepository(manager);

    expect(await repo.getByAssetIds([mptId, iouId])).toStrictEqual([mpt, iou]);
  });

  it('filters getByAssetType by assetType and chainId', async () => {
    const iou = generateIouAsset(KnownCaip2ChainId.Mainnet);
    const mpt = generateMptAsset(KnownCaip2ChainId.Mainnet);
    const manager = createMockStateManager({
      assets: { [iouId]: iou, [mptId]: mpt },
    });
    const repo = new AssetMetadataRepository(manager);

    expect(
      await repo.getByAssetType(AssetType.Mpt, KnownCaip2ChainId.Mainnet),
    ).toStrictEqual([mpt]);
  });

  it('sets persistedAt when saving without advancing catalog sync time', async () => {
    const manager = createMockStateManager({ assets: {} });
    const repo = new AssetMetadataRepository(manager);
    const row = generateMptAsset(KnownCaip2ChainId.Mainnet);
    const before = Date.now();

    await repo.saveMany([row]);

    const saved = await repo.getByAssetId(mptId);
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
    const row = generateMptAsset(KnownCaip2ChainId.Mainnet);
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
    const row = generateIouAsset(KnownCaip2ChainId.Mainnet);
    const manager = createMockStateManager({ assets: { [iouId]: row } });
    const repo = new AssetMetadataRepository(manager);

    expect(await repo.getByAssetId(iouId)).toStrictEqual(row);
    expect(await repo.getByAssetId(mptId)).toBeNull();
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
