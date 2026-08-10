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
import { configProvider } from '../../context';
import type { Network } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import type { ILogger } from '../../utils/logger';
import type { State, UnencryptedStateValue } from '../state/State';
import type { CoreAssetsAdapter } from './adapters/CoreAssetsAdapter';
import { CoreAssetsAdapter as CoreAssetsAdapterClass } from './adapters/CoreAssetsAdapter';
import { SnapAssetsAdapter } from './adapters/SnapAssetsAdapter';
import type { AssetsRepository } from './AssetsRepository';

type AssetsServiceDependencies = {
  logger: ILogger;
  assetsRepository: AssetsRepository;
  state: State<UnencryptedStateValue>;
  trongridApiClient: TrongridApiClient;
  tronHttpClient: TronHttpClient;
  priceApiClient: PriceApiClient;
  tokenApiClient: TokenApiClient;
  snapClient: SnapClient;
  remoteFeatureFlagsProvider?: RemoteFeatureFlagsProvider;
  assetsProvider?: AssetsProvider;
};

type AssetsServiceAdapters = {
  snapAdapter: SnapAssetsAdapter;
  coreAdapter: CoreAssetsAdapter;
  remoteFeatureFlagsProvider: RemoteFeatureFlagsProvider;
};

function hasAdapterOptions(
  options: AssetsServiceDependencies | AssetsServiceAdapters,
): options is AssetsServiceAdapters {
  const candidate = options as AssetsServiceAdapters;
  return candidate.snapAdapter !== undefined && candidate.coreAdapter !== undefined;
}

/**
 * Assets domain facade. Currently delegates all behavior to SnapAssetsAdapter
 * (legacy snap-owned reads/writes). Core adapter is initialized for upcoming
 * routing without changing callers.
 */
export class AssetsService {
  readonly #snapAdapter: SnapAssetsAdapter;

  // Initialized for upcoming Core routing; not read until the migration PR lands.
  // eslint-disable-next-line no-unused-private-class-members -- reserved adapter slot
  readonly #coreAdapter: CoreAssetsAdapter;

  readonly cacheTtlsMilliseconds: SnapAssetsAdapter['cacheTtlsMilliseconds'];

  constructor(options: AssetsServiceDependencies | AssetsServiceAdapters) {
    if (hasAdapterOptions(options)) {
      this.#snapAdapter = options.snapAdapter;
      this.#coreAdapter = options.coreAdapter;
    } else {
      this.#snapAdapter = new SnapAssetsAdapter({
        logger: options.logger,
        assetsRepository: options.assetsRepository,
        state: options.state,
        trongridApiClient: options.trongridApiClient,
        tronHttpClient: options.tronHttpClient,
        priceApiClient: options.priceApiClient,
        tokenApiClient: options.tokenApiClient,
        snapClient: options.snapClient,
        configProvider,
      });
      this.#coreAdapter = new CoreAssetsAdapterClass({
        logger: options.logger,
        assetsProvider: options.assetsProvider as AssetsProvider,
      });
    }

    this.cacheTtlsMilliseconds = this.#snapAdapter.cacheTtlsMilliseconds;
  }

  static isFiat(caipAssetId: CaipAssetType): boolean {
    return SnapAssetsAdapter.isFiat(caipAssetId);
  }

  static hasChanged(asset: AssetEntity, assetsLookup: AssetEntity[]): boolean {
    return SnapAssetsAdapter.hasChanged(asset, assetsLookup);
  }

  async getAccountAssets(accountId: string): Promise<AssetEntity[]> {
    return this.#snapAdapter.getAccountAssets(accountId);
  }

  async getAccountAssetsByIDs(
    accountId: string,
    assetTypes: string[],
  ): Promise<(AssetEntity | null)[]> {
    return this.#snapAdapter.getAccountAssetsByIDs(accountId, assetTypes);
  }

  async getAccountAssetByID(
    accountId: string,
    assetType: string,
  ): Promise<AssetEntity | null> {
    return this.#snapAdapter.getAccountAssetByID(accountId, assetType);
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

  async getByKeyringAccountId(accountId: string): Promise<AssetEntity[]> {
    return this.#snapAdapter.getByKeyringAccountId(accountId);
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
