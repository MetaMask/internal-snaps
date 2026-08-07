import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
  parseSnapsAssetsMigrationStage,
} from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import type {
  AssetsProvider,
  RemoteFeatureFlagsProvider,
} from '@metamask/snap-networks-utils';
import type {
  AssetConversion,
  AssetMetadata,
  FungibleAssetMarketData,
  HistoricalPriceIntervals,
} from '@metamask/snaps-sdk';
import type { CaipAssetType } from '@metamask/utils';

import type { PriceApiClient } from '../../clients/price-api/PriceApiClient';
import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TokenApiClient } from '../../clients/token-api/TokenApiClient';
import type { TronHttpClient } from '../../clients/tron-http/TronHttpClient';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import { Network } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import type { ILogger } from '../../utils/logger';
import type { ConfigProvider } from '../config';
import type { State, UnencryptedStateValue } from '../state/State';
import { CoreAssetsAdapter } from './adapters/CoreAssetsAdapter';
import { SnapAssetsAdapter } from './adapters/SnapAssetsAdapter';
import type { AssetsRepository } from './AssetsRepository';

/**
 * Assets domain facade. Reads use the Snap adapter while migration is off, and
 * the Core adapter once migration is active.
 */
export class AssetsService {
  readonly #snapAdapter: SnapAssetsAdapter;

  readonly #coreAdapter: CoreAssetsAdapter;

  readonly #remoteFeatureFlagsProvider: RemoteFeatureFlagsProvider;

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
    configProvider,
    assetsProvider,
    remoteFeatureFlagsProvider,
  }: {
    logger: ILogger;
    assetsRepository: AssetsRepository;
    state: State<UnencryptedStateValue>;
    trongridApiClient: TrongridApiClient;
    tronHttpClient: TronHttpClient;
    priceApiClient: PriceApiClient;
    tokenApiClient: TokenApiClient;
    snapClient: SnapClient;
    configProvider: ConfigProvider;
    assetsProvider: AssetsProvider;
    remoteFeatureFlagsProvider: RemoteFeatureFlagsProvider;
  }) {
    this.#remoteFeatureFlagsProvider = remoteFeatureFlagsProvider;

    this.#snapAdapter = new SnapAssetsAdapter({
      logger,
      assetsRepository,
      state,
      trongridApiClient,
      tronHttpClient,
      priceApiClient,
      tokenApiClient,
      snapClient,
      configProvider,
    });
    this.#coreAdapter = new CoreAssetsAdapter({
      logger,
      assetsProvider,
    });
    this.cacheTtlsMilliseconds = this.#snapAdapter.cacheTtlsMilliseconds;
  }

  async #getAssetsMigrationStage(): Promise<SnapsAssetsMigrationStage> {
    const flagValue = await this.#remoteFeatureFlagsProvider.getFeatureFlag(
      SNAPS_ASSETS_MIGRATION_FLAG_KEYS.tron,
    );
    return parseSnapsAssetsMigrationStage(flagValue);
  }

  static isFiat(caipAssetId: CaipAssetType): boolean {
    return SnapAssetsAdapter.isFiat(caipAssetId);
  }

  static hasChanged(asset: AssetEntity, assetsLookup: AssetEntity[]): boolean {
    return SnapAssetsAdapter.hasChanged(asset, assetsLookup);
  }

  async getAccountAssetsByScope(
    scope: Network,
    accountId: string,
  ): Promise<AssetEntity[]> {
    const migrationStage = await this.#getAssetsMigrationStage();

    if (migrationStage === SnapsAssetsMigrationStage.Off) {
      return this.#snapAdapter.getAccountAssetsByScope(scope, accountId);
    }

    return this.#coreAdapter.getAccountAssetsByScope(scope, accountId);
  }

  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: string[],
  ): Promise<(AssetEntity | null)[]> {
    if (assetIds.length === 0) {
      return [];
    }

    const migrationStage = await this.#getAssetsMigrationStage();

    if (migrationStage === SnapsAssetsMigrationStage.Off) {
      return this.#snapAdapter.getAccountAssetsByIDs(accountId, assetIds);
    }

    return this.#coreAdapter.getAccountAssetsByIDs(accountId, assetIds);
  }

  async getAccountAssetByID(
    accountId: string,
    assetId: string,
  ): Promise<AssetEntity | null> {
    const migrationStage = await this.#getAssetsMigrationStage();

    if (migrationStage === SnapsAssetsMigrationStage.Off) {
      return this.#snapAdapter.getAccountAssetByID(accountId, assetId);
    }

    return this.#coreAdapter.getAccountAssetByID(accountId, assetId);
  }

  async fetchAssetsAndBalancesForAccount(
    scope: Network,
    account: KeyringAccount,
  ): Promise<AssetEntity[]> {
    return this.#snapAdapter.fetchAssetsAndBalancesForAccount(scope, account);
  }

  async getAssetsMetadata(
    assetTypes: CaipAssetType[],
  ): Promise<Record<CaipAssetType, AssetMetadata | null>> {
    return this.#snapAdapter.getAssetsMetadata(assetTypes);
  }

  async saveMany(assets: AssetEntity[]): Promise<void> {
    return this.#snapAdapter.saveMany(assets);
  }

  async getAll(): Promise<AssetEntity[]> {
    return this.#snapAdapter.getAll();
  }

  async getAccountAssets(accountId: string): Promise<AssetEntity[]> {
    const migrationStage = await this.#getAssetsMigrationStage();

    if (migrationStage === SnapsAssetsMigrationStage.Off) {
      return this.#snapAdapter.getAccountAssets(accountId);
    }

    return this.#coreAdapter.getAccountAssets(accountId);
  }

  async getMultipleTokenConversions(
    conversions: { from: CaipAssetType; to: CaipAssetType }[],
  ): Promise<
    Record<CaipAssetType, Record<CaipAssetType, AssetConversion | null>>
  > {
    return this.#snapAdapter.getMultipleTokenConversions(conversions);
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
}
