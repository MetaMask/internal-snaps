import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
} from '@metamask/assets-controller';

import { Network } from '../../constants';
import type { CoreMessengerCaller } from '../../types/core-messenger';

import {
  modeFromStage,
  parseStageFromEnv,
  parseStageFromRemoteFlags,
  resolveAssetsMigrationMode,
} from './assetsMigrationMode';

const TRON_CHAIN_ID = Network.Mainnet;
const TRON_FLAG_KEY = SNAPS_ASSETS_MIGRATION_FLAG_KEYS.tron;

describe('assetsMigrationMode', () => {
  describe('modeFromStage', () => {
    it('maps Off to snap', () => {
      expect(modeFromStage(SnapsAssetsMigrationStage.Off)).toBe('snap');
    });

    it.each([
      SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
      SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback,
      SnapsAssetsMigrationStage.ReadAssetsControllerOnly,
    ])('maps active stage %s to controller', (stage) => {
      expect(modeFromStage(stage)).toBe('controller');
    });
  });

  describe('parseStageFromRemoteFlags', () => {
    it('returns Off when remote flag is Off', () => {
      expect(
        parseStageFromRemoteFlags(
          { [TRON_FLAG_KEY]: { stage: SnapsAssetsMigrationStage.Off } },
          TRON_CHAIN_ID,
        ),
      ).toBe(SnapsAssetsMigrationStage.Off);
    });

    it.each([
      SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
      SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback,
      SnapsAssetsMigrationStage.ReadAssetsControllerOnly,
    ])('returns stage %s from remote flags', (stage) => {
      expect(
        parseStageFromRemoteFlags(
          { [TRON_FLAG_KEY]: { stage } },
          TRON_CHAIN_ID,
        ),
      ).toBe(stage);
    });

    it('returns undefined when remote flags are missing', () => {
      expect(parseStageFromRemoteFlags(undefined, TRON_CHAIN_ID)).toBeUndefined();
      expect(parseStageFromRemoteFlags({}, TRON_CHAIN_ID)).toBeUndefined();
    });
  });

  describe('parseStageFromEnv', () => {
    it.each(['off', '0'])('accepts Off alias %s', (value) => {
      expect(parseStageFromEnv(value)).toBe(SnapsAssetsMigrationStage.Off);
    });

    it.each(['read-assets-controller-without-fallback', '2', 'controller'])(
      'accepts controller alias %s',
      (value) => {
        expect(parseStageFromEnv(value)).toBe(
          SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback,
        );
      },
    );

    it.each([
      '1',
      'read-assets-controller-with-fallback',
      '3',
      'read-assets-controller-only',
      'only',
      'with-fallback',
      'invalid',
    ])('rejects unsupported env value %s', (value) => {
      expect(parseStageFromEnv(value)).toBeUndefined();
    });
  });

  describe('resolveAssetsMigrationMode', () => {
    const createMessenger = (
      remoteFeatureFlags: Record<string, unknown> | undefined,
    ): CoreMessengerCaller => ({
      call: jest.fn().mockResolvedValue({ remoteFeatureFlags }),
    });

    it('prefers remote flags over env', async () => {
      const coreMessenger = createMessenger({
        [TRON_FLAG_KEY]: {
          stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback,
        },
      });

      await expect(
        resolveAssetsMigrationMode({
          coreMessenger,
          chainId: TRON_CHAIN_ID,
          isDev: true,
          envStage: SnapsAssetsMigrationStage.Off,
        }),
      ).resolves.toBe('controller');
    });

    it('uses env in non-production when remote flags are absent', async () => {
      const coreMessenger = createMessenger({});

      await expect(
        resolveAssetsMigrationMode({
          coreMessenger,
          chainId: TRON_CHAIN_ID,
          isDev: true,
          envStage:
            SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback,
        }),
      ).resolves.toBe('controller');

      await expect(
        resolveAssetsMigrationMode({
          coreMessenger,
          chainId: TRON_CHAIN_ID,
          isDev: true,
          envStage: SnapsAssetsMigrationStage.Off,
        }),
      ).resolves.toBe('snap');
    });

    it('ignores env in production', async () => {
      const coreMessenger = createMessenger({});

      await expect(
        resolveAssetsMigrationMode({
          coreMessenger,
          chainId: TRON_CHAIN_ID,
          isDev: false,
          envStage:
            SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback,
        }),
      ).resolves.toBe('snap');
    });

    it('defaults to snap when everything is missing', async () => {
      const coreMessenger = createMessenger(undefined);

      await expect(
        resolveAssetsMigrationMode({
          coreMessenger,
          chainId: TRON_CHAIN_ID,
          isDev: true,
          envStage: undefined,
        }),
      ).resolves.toBe('snap');
    });
  });
});
