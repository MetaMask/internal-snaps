import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
  getSnapsAssetsMigrationNamespace,
  parseSnapsAssetsMigrationStage,
} from '@metamask/assets-controller';
import type { Caip19AssetId } from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import type { AssetsProvider } from '@metamask/snap-networks-utils';
import type {
  AssetConversion,
  AssetMetadata,
  FungibleAssetMarketData,
  HistoricalPriceIntervals,
} from '@metamask/snaps-sdk';
import type { CaipAssetType, CaipChainId, Json } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import type { PriceApiClient } from '../../clients/price-api/PriceApiClient';
import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TokenApiClient } from '../../clients/token-api/TokenApiClient';
import type { TronHttpClient } from '../../clients/tron-http/TronHttpClient';
import type { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import { Network } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import type { CoreMessengerCaller } from '../../types/core-messenger';
import type { ILogger } from '../../utils/logger';
import type { State, UnencryptedStateValue } from '../state/State';
import { SnapAssetsAdapter } from './adapters/SnapAssetsAdapter';
import type { AssetsRepository } from './AssetsRepository';
import { mapControllerAsset } from './mapControllerAsset';

/**
 * Assets migration stage used when no remote feature flag is set for the chain.
 * Change this value to test Stage 0 / 1 / 2 locally.
 */
const ASSETS_MIGRATION_STAGE = SnapsAssetsMigrationStage.Off;

export class AssetsService {
  readonly #snapAdapter: SnapAssetsAdapter;

  readonly #assetsProvider: AssetsProvider;

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
    assetsProvider,
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
    assetsProvider: AssetsProvider;
  }) {
    this.#coreMessenger = coreMessenger;
    this.#assetsProvider = assetsProvider;

    this.#snapAdapter = new SnapAssetsAdapter({
      logger,
      assetsRepository,
      state,
      trongridApiClient,
      tronHttpClient,
      priceApiClient,
      tokenApiClient,
      snapClient,
      resolveMigrationStage: (
        chainId: string,
      ): Promise<SnapsAssetsMigrationStage> =>
        this.#resolveMigrationStage(chainId),
    });
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

      if (Object.hasOwn(remoteFeatureFlags, flagKey)) {
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

  static isFiat(caipAssetId: CaipAssetType): boolean {
    return SnapAssetsAdapter.isFiat(caipAssetId);
  }

  static hasChanged(asset: AssetEntity, assetsLookup: AssetEntity[]): boolean {
    return SnapAssetsAdapter.hasChanged(asset, assetsLookup);
  }

  async getAccountAssetByID(
    accountId: string,
    assetId: string,
  ): Promise<AssetEntity | null> {
    const { chainId } = parseCaipAssetType(assetId as CaipAssetType);
    const stage = await this.#resolveMigrationStage(chainId);

    if (stage === SnapsAssetsMigrationStage.Off) {
      return this.#snapAdapter.getAccountAssetByID(accountId, assetId);
    }

    const asset = await this.#assetsProvider.getAccountAssetByID(
      accountId,
      assetId as Caip19AssetId,
    );

    if (!asset) {
      return null;
    }

    return mapControllerAsset(accountId, asset);
  }

  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: string[],
  ): Promise<(AssetEntity | null)[]> {
    if (assetIds.length === 0) {
      return [];
    }

    const { chainId } = parseCaipAssetType(assetIds[0] as CaipAssetType);
    const stage = await this.#resolveMigrationStage(chainId);

    if (stage === SnapsAssetsMigrationStage.Off) {
      const results = await this.#snapAdapter.getAccountAssetsByIDs(
        accountId,
        assetIds,
      );

      return assetIds.map((assetId) => results[assetId] ?? null);
    }

    const controllerAssets = await this.#assetsProvider.getAccountAssetsByIDs(
      accountId,
      assetIds as Caip19AssetId[],
    );

    return assetIds.map((assetId) => {
      const controllerAsset = controllerAssets[assetId as Caip19AssetId];
      return controllerAsset
        ? mapControllerAsset(accountId, controllerAsset)
        : null;
    });
  }

  async getAccountAssetsByScope(
    scope: Network,
    accountId: string,
  ): Promise<AssetEntity[]> {
    const stage = await this.#resolveMigrationStage(scope);

    if (stage === SnapsAssetsMigrationStage.Off) {
      return this.#snapAdapter.getAccountAssetsByScope(scope, accountId);
    }

    const controllerAssets = await this.#assetsProvider.getAccountAssetsByScope(
      scope,
      accountId,
    );

    return Object.values(controllerAssets).map((asset) =>
      mapControllerAsset(accountId, asset),
    );
  }

  async getByKeyringAccountId(accountId: string): Promise<AssetEntity[]> {
    return this.getAccountAssetsByScope(Network.Mainnet, accountId);
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

  async getAll(): Promise<AssetEntity[]> {
    return this.#snapAdapter.getAll();
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
}

export { SnapsAssetsMigrationStage };
