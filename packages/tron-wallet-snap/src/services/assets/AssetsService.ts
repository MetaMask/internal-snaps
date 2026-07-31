import type {
  AssetConversion,
  AssetMetadata,
  FungibleAssetMarketData,
  HistoricalPriceIntervals,
} from '@metamask/snaps-sdk';
import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
  getSnapsAssetsMigrationNamespace,
  parseSnapsAssetsMigrationStage,
} from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import type { CaipAssetType, CaipChainId, Json } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import type { PriceApiClient } from '../../clients/price-api/PriceApiClient';
import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TokenApiClient } from '../../clients/token-api/TokenApiClient';
import type { TronHttpClient } from '../../clients/tron-http/TronHttpClient';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import type { Network } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import type { ILogger } from '../../utils/logger';
import type { State, UnencryptedStateValue } from '../state/State';
import type { CoreMessengerCaller } from '../../types/core-messenger';
import type { AssetsRepository } from './AssetsRepository';
import { CoreAssetsAdapter } from './adapters/CoreAssetsAdapter';
import { SnapAssetsAdapter } from './adapters/SnapAssetsAdapter';
import { isSnapOwnedAsset } from './snapOwnedAssets';

/**
 * Assets migration stage used when no remote feature flag is set for the chain.
 * Change this value to test Stage 0 / 1 / 2 locally.
 */
const ASSETS_MIGRATION_STAGE = SnapsAssetsMigrationStage.Off;

export class AssetsService {
  readonly #snapAdapter: SnapAssetsAdapter;

  readonly #coreAdapter: CoreAssetsAdapter;

  readonly #coreMessenger: CoreMessengerCaller;

  readonly cacheTtlsMilliseconds: SnapAssetsAdapter['cacheTtlsMilliseconds'];

  constructor({
    logger,
    assetsRepository,
    state,
    trongridApiClient,
    tronHttpClient,
    priceApiClient,
    tokenApiClient,
    snapClient,
    coreMessenger,
  }: {
    logger: ILogger;
    assetsRepository: AssetsRepository;
    state: State<UnencryptedStateValue>;
    trongridApiClient: TrongridApiClient;
    tronHttpClient: TronHttpClient;
    priceApiClient: PriceApiClient;
    tokenApiClient: TokenApiClient;
    snapClient: SnapClient;
    coreMessenger: CoreMessengerCaller;
  }) {
    this.#coreMessenger = coreMessenger;

    this.#snapAdapter = new SnapAssetsAdapter({
      logger,
      assetsRepository,
      state,
      trongridApiClient,
      tronHttpClient,
      priceApiClient,
      tokenApiClient,
      snapClient,
      resolveMigrationStage: (chainId) =>
        this.#resolveMigrationStage(chainId),
    });
    this.#coreAdapter = new CoreAssetsAdapter({ coreMessenger });
    this.cacheTtlsMilliseconds = this.#snapAdapter.cacheTtlsMilliseconds;
  }

  async #resolveMigrationStage(
    chainId: string,
  ): Promise<SnapsAssetsMigrationStage> {
    const { remoteFeatureFlags } = await this.#coreMessenger.call(
      'RemoteFeatureFlagController:getState',
    );

    const namespace = getSnapsAssetsMigrationNamespace(chainId as CaipChainId);

    if (namespace) {
      const flagKey = SNAPS_ASSETS_MIGRATION_FLAG_KEYS[namespace];

      if (flagKey in remoteFeatureFlags) {
        const remoteStage = parseSnapsAssetsMigrationStage(
          remoteFeatureFlags[flagKey] as Json | undefined,
        );

        if (remoteStage !== undefined) {
          return remoteStage;
        }
      }
    }

    return ASSETS_MIGRATION_STAGE;
  }

  async getAccountAssetByID(
    accountId: string,
    assetId: string,
  ): Promise<AssetEntity | null> {
    if (isSnapOwnedAsset(assetId)) {
      return this.#snapAdapter.getAccountAssetByID(accountId, assetId);
    }

    const { chainId } = parseCaipAssetType(assetId as CaipAssetType);
    const stage = await this.#resolveMigrationStage(chainId);

    if (stage === SnapsAssetsMigrationStage.Off) {
      return this.#snapAdapter.getAccountAssetByID(accountId, assetId);
    }

    if (stage === SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback) {
      try {
        return await this.#coreAdapter.getAccountAssetByID(accountId, assetId);
      } catch {
        return this.#snapAdapter.getAccountAssetByID(accountId, assetId);
      }
    }

    return this.#coreAdapter.getAccountAssetByID(accountId, assetId);
  }

  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: string[],
  ): Promise<Record<string, AssetEntity | null>> {
    if (assetIds.length === 0) {
      return {};
    }

    const result: Record<string, AssetEntity | null> = {};
    const fungibleIds: string[] = [];

    for (const assetId of assetIds) {
      if (isSnapOwnedAsset(assetId)) {
        result[assetId] = await this.#snapAdapter.getAccountAssetByID(
          accountId,
          assetId,
        );
      } else {
        fungibleIds.push(assetId);
      }
    }

    if (fungibleIds.length === 0) {
      return result;
    }

    const { chainId } = parseCaipAssetType(fungibleIds[0] as CaipAssetType);
    const stage = await this.#resolveMigrationStage(chainId);

    if (stage === SnapsAssetsMigrationStage.Off) {
      return {
        ...result,
        ...(await this.#snapAdapter.getAccountAssetsByIDs(accountId, fungibleIds)),
      };
    }

    if (stage === SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback) {
      try {
        return {
          ...result,
          ...(await this.#coreAdapter.getAccountAssetsByIDs(
            accountId,
            fungibleIds,
          )),
        };
      } catch {
        return {
          ...result,
          ...(await this.#snapAdapter.getAccountAssetsByIDs(
            accountId,
            fungibleIds,
          )),
        };
      }
    }

    return {
      ...result,
      ...(await this.#coreAdapter.getAccountAssetsByIDs(accountId, fungibleIds)),
    };
  }

  async getAccountAssetsByScope(
    scope: Network,
    accountId: string,
  ): Promise<AssetEntity[]> {
    const snapAssets = await this.#snapAdapter.getAccountAssetsByScope(
      scope,
      accountId,
    );
    const snapOwnedAssets = snapAssets.filter((asset) =>
      isSnapOwnedAsset(asset.assetType),
    );
    const stage = await this.#resolveMigrationStage(scope);

    if (stage === SnapsAssetsMigrationStage.Off) {
      return snapAssets;
    }

    if (stage === SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback) {
      try {
        const coreAssets = await this.#coreAdapter.getAccountAssetsByScope(
          scope,
          accountId,
        );
        return [
          ...coreAssets.filter((asset) => !isSnapOwnedAsset(asset.assetType)),
          ...snapOwnedAssets,
        ];
      } catch {
        return snapAssets;
      }
    }

    const coreAssets = await this.#coreAdapter.getAccountAssetsByScope(
      scope,
      accountId,
    );
    return [
      ...coreAssets.filter((asset) => !isSnapOwnedAsset(asset.assetType)),
      ...snapOwnedAssets,
    ];
  }

  async fetchAssetsAndBalancesForAccount(
    scope: Network,
    account: KeyringAccount,
  ): Promise<AssetEntity[]> {
    return this.#snapAdapter.fetchAssetsAndBalancesForAccount(scope, account);
  }

  async saveMany(assets: AssetEntity[]): Promise<void> {
    return this.#snapAdapter.saveMany(assets);
  }

  async getHistoricalPrice(
    from: CaipAssetType,
    to: CaipAssetType,
  ): Promise<{
    intervals: HistoricalPriceIntervals;
    updateTime: number;
    expirationTime?: number;
  }> {
    return this.#snapAdapter.getHistoricalPrice(from, to);
  }

  async getMultipleTokenConversions(
    conversions: { from: CaipAssetType; to: CaipAssetType }[],
  ): Promise<
    Record<CaipAssetType, Record<CaipAssetType, AssetConversion | null>>
  > {
    return this.#snapAdapter.getMultipleTokenConversions(conversions);
  }

  async getAssetsMetadata(
    assetTypes: CaipAssetType[],
  ): Promise<Record<CaipAssetType, AssetMetadata | null>> {
    return this.#snapAdapter.getAssetsMetadata(assetTypes);
  }

  async getMultipleTokensMarketData(
    assets: {
      asset: CaipAssetType;
      unit: CaipAssetType;
    }[],
  ): Promise<
    Record<CaipAssetType, Record<CaipAssetType, FungibleAssetMarketData>>
  > {
    return this.#snapAdapter.getMultipleTokensMarketData(assets);
  }

  static isFiat(caipAssetId: CaipAssetType): boolean {
    return SnapAssetsAdapter.isFiat(caipAssetId);
  }

  static hasChanged(asset: AssetEntity, assetsLookup: AssetEntity[]): boolean {
    return SnapAssetsAdapter.hasChanged(asset, assetsLookup);
  }
}

export { SnapsAssetsMigrationStage };
