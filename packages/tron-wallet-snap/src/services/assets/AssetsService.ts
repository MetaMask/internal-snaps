import type { Caip19AssetId } from '@metamask/assets-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import type { AssetsProvider } from '@metamask/snap-networks-utils';
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
import type { State, UnencryptedStateValue } from '../state/State';
import { SnapAssetsAdapter } from './adapters/SnapAssetsAdapter';
import type { AssetsRepository } from './AssetsRepository';
import { mapControllerAsset } from './mapControllerAsset';
import { isSnapOwnedAsset } from './snapOwnedAssets';

export class AssetsService {
  readonly #snapAdapter: SnapAssetsAdapter;

  readonly #assetsProvider: AssetsProvider;

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
    assetsProvider: AssetsProvider;
  }) {
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
    });
    this.cacheTtlsMilliseconds = this.#snapAdapter.cacheTtlsMilliseconds;
  }

  static isFiat(caipAssetId: CaipAssetType): boolean {
    return SnapAssetsAdapter.isFiat(caipAssetId);
  }

  static hasChanged(asset: AssetEntity, assetsLookup: AssetEntity[]): boolean {
    return SnapAssetsAdapter.hasChanged(asset, assetsLookup);
  }

  async #getProviderAccountAssetByID(
    accountId: string,
    assetId: string,
  ): Promise<AssetEntity | null> {
    const asset = await this.#assetsProvider.getAccountAssetByID(
      accountId,
      assetId as Caip19AssetId,
    );

    if (!asset) {
      return null;
    }

    return mapControllerAsset(accountId, asset);
  }

  async #getProviderAccountAssetsByIDs(
    accountId: string,
    assetIds: string[],
  ): Promise<Record<string, AssetEntity | null>> {
    const controllerAssets = await this.#assetsProvider.getAccountAssetsByIDs(
      accountId,
      assetIds as Caip19AssetId[],
    );

    return Object.fromEntries(
      assetIds.map((assetId) => {
        const controllerAsset = controllerAssets[assetId as Caip19AssetId];
        return [
          assetId,
          controllerAsset
            ? mapControllerAsset(accountId, controllerAsset)
            : null,
        ];
      }),
    );
  }

  async #getProviderAccountAssetsByScope(
    scope: Network,
    accountId: string,
  ): Promise<AssetEntity[]> {
    const controllerAssets = await this.#assetsProvider.getAccountAssetsByScope(
      scope,
      accountId,
    );

    return Object.values(controllerAssets).map((asset) =>
      mapControllerAsset(accountId, asset),
    );
  }

  async getAccountAssetByID(
    accountId: string,
    assetId: string,
  ): Promise<AssetEntity | null> {
    if (isSnapOwnedAsset(assetId)) {
      return this.#snapAdapter.getAccountAssetByID(accountId, assetId);
    }

    return this.#getProviderAccountAssetByID(accountId, assetId);
  }

  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: string[],
  ): Promise<(AssetEntity | null)[]> {
    if (assetIds.length === 0) {
      return [];
    }

    const result: (AssetEntity | null)[] = new Array(assetIds.length).fill(
      null,
    );
    const fungibleIds: string[] = [];
    const fungibleIndices: number[] = [];

    for (const [index, assetId] of assetIds.entries()) {
      if (isSnapOwnedAsset(assetId)) {
        result[index] = await this.#snapAdapter.getAccountAssetByID(
          accountId,
          assetId,
        );
      } else {
        fungibleIds.push(assetId);
        fungibleIndices.push(index);
      }
    }

    if (fungibleIds.length === 0) {
      return result;
    }

    const fungibleResults = await this.#getProviderAccountAssetsByIDs(
      accountId,
      fungibleIds,
    );

    fungibleIds.forEach((assetId, fungibleIndex) => {
      const resultIndex = fungibleIndices[fungibleIndex];
      if (resultIndex !== undefined) {
        result[resultIndex] = fungibleResults[assetId] ?? null;
      }
    });

    return result;
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
    const coreAssets = await this.#getProviderAccountAssetsByScope(
      scope,
      accountId,
    );

    return [
      ...coreAssets.filter((asset) => !isSnapOwnedAsset(asset.assetType)),
      ...snapOwnedAssets,
    ];
  }

  async getByKeyringAccountId(accountId: string): Promise<AssetEntity[]> {
    const assets = await this.#snapAdapter.getAccountAssetsByScope(
      Network.Mainnet,
      accountId,
    );

    return assets.filter((asset) => isSnapOwnedAsset(asset.assetType));
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
