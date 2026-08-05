/* eslint-disable jsdoc/require-returns */
import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
  getSnapsAssetsMigrationNamespace,
  parseSnapsAssetsMigrationStage,
} from '@metamask/assets-controller';
import type { Caip19AssetId } from '@metamask/assets-controller';
import type { AssetsProvider } from '@metamask/snap-networks-utils';
import type {
  FungibleAssetMarketData,
  FungibleAssetMetadata,
} from '@metamask/snaps-sdk';
import type { CaipAssetType, CaipChainId, Json } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import type { AssetEntity, SolanaKeyringAccount } from '../../../entities';
import type { CoreMessengerCaller } from '../../../types/core-messenger';
import type { NftApiClient } from '../../clients/nft-api/NftApiClient';
import type { TokenApiClient } from '../../clients/token-api-client/TokenApiClient';
import { SolanaCaip19Tokens } from '../../constants/solana';
import type {
  Caip10Address,
  NativeCaipAssetType,
  NftCaipAssetType,
  TokenCaipAssetType,
} from '../../constants/solana';
import { createPrefixedLogger } from '../../utils/logger';
import type { ILogger } from '../../utils/logger';
import type { AccountsService } from '../accounts/AccountsService';
import type { ConfigProvider } from '../config';
import type { TokenPricesService } from '../token-prices/TokenPrices';
import { SnapAssetsAdapter } from './adapters/SnapAssetsAdapter';
import { mapControllerAsset } from './mapControllerAsset';
import { shouldTrackSnapAssets } from './shouldTrackSnapAssets';
import { isSnapOwnedAsset } from './snapOwnedAssets';
import type { AssetMetadata, NonFungibleAssetMetadata } from './types';

export { shouldTrackSnapAssets };

/**
 * Assets migration stage used when no remote feature flag is set for the chain.
 */
const ASSETS_MIGRATION_STAGE = SnapsAssetsMigrationStage.Off;

function isFungibleProviderAsset(assetId: string): boolean {
  return !isSnapOwnedAsset(assetId);
}

export class AssetsService {
  readonly #logger: ILogger;

  readonly #configProvider: ConfigProvider;

  readonly #snapAdapter: SnapAssetsAdapter;

  readonly #assetsProvider: AssetsProvider;

  readonly #coreMessenger: CoreMessengerCaller;

  readonly #accountsService: AccountsService;

  readonly #tokenPricesService: TokenPricesService;

  readonly #tokenApiClient: TokenApiClient;

  readonly #nftApiClient: NftApiClient;

  constructor({
    logger,
    configProvider,
    snapAssetsAdapter,
    coreMessenger,
    accountsService,
    tokenApiClient,
    tokenPricesService,
    nftApiClient,
    assetsProvider,
  }: {
    logger: ILogger;
    configProvider: ConfigProvider;
    snapAssetsAdapter: SnapAssetsAdapter;
    coreMessenger: CoreMessengerCaller;
    accountsService: AccountsService;
    tokenApiClient: TokenApiClient;
    tokenPricesService: TokenPricesService;
    nftApiClient: NftApiClient;
    assetsProvider: AssetsProvider;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🪙 AssetsService]');
    this.#configProvider = configProvider;
    this.#snapAdapter = snapAssetsAdapter;
    this.#coreMessenger = coreMessenger;
    this.#accountsService = accountsService;
    this.#assetsProvider = assetsProvider;
    this.#tokenApiClient = tokenApiClient;
    this.#tokenPricesService = tokenPricesService;
    this.#nftApiClient = nftApiClient;
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

  async #solanaChainIds(): Promise<string[]> {
    return this.#configProvider.getActiveNetworks();
  }

  async #filterTrackableAssets(assets: AssetEntity[]): Promise<AssetEntity[]> {
    const filtered: AssetEntity[] = [];

    for (const asset of assets) {
      if (isSnapOwnedAsset(asset.assetType)) {
        filtered.push(asset);
        continue;
      }

      if (await this.shouldTrackSnapAssetsForScope(asset.network)) {
        filtered.push(asset);
      }
    }

    return filtered;
  }

  async shouldTrackSnapAssetsForScope(scope: CaipChainId): Promise<boolean> {
    const stage = await this.#resolveMigrationStage(scope);
    return shouldTrackSnapAssets(stage);
  }

  async shouldTrackSnapAssetsForAccount(accountId: string): Promise<boolean> {
    const account = await this.#accountsService.findById(accountId);
    if (!account) {
      return false;
    }

    for (const scope of account.scopes) {
      if (await this.shouldTrackSnapAssetsForScope(scope)) {
        return true;
      }
    }

    return false;
  }

  async #getCoreAccountAssetByID(
    accountId: string,
    assetId: CaipAssetType,
    accountAddress: string,
  ): Promise<AssetEntity | null> {
    const result = await this.#assetsProvider.getAccountAssetByID(
      accountId,
      assetId as Caip19AssetId,
    );

    if (!result) {
      return null;
    }

    return mapControllerAsset(accountId, assetId, accountAddress, result);
  }

  async #getCoreAccountAssetsByIDs(
    accountId: string,
    assetIds: string[],
    accountAddress: string,
  ): Promise<Record<string, AssetEntity | null>> {
    const fungibleAssetIds = assetIds.filter(isFungibleProviderAsset);
    const providerAssets = fungibleAssetIds.length
      ? await this.#assetsProvider.getAccountAssetsByIDs(
          accountId,
          fungibleAssetIds as Caip19AssetId[],
        )
      : {};

    const entries = await Promise.all(
      assetIds.map(async (assetId) => {
        if (!isFungibleProviderAsset(assetId)) {
          return [assetId, null] as const;
        }

        const asset = providerAssets[assetId as Caip19AssetId];
        if (!asset) {
          return [assetId, null] as const;
        }

        const entity = await mapControllerAsset(
          accountId,
          assetId as CaipAssetType,
          accountAddress,
          asset,
        );
        return [assetId, entity] as const;
      }),
    );

    return Object.fromEntries(entries);
  }

  async #getCoreAccountAssetsByScope(
    scope: CaipChainId,
    accountId: string,
    accountAddress: string,
  ): Promise<AssetEntity[]> {
    const providerAssets = await this.#assetsProvider.getAccountAssetsByScope(
      scope,
      accountId,
    );

    const supportedEntries = Object.entries(providerAssets).filter(
      ([assetId]) => isFungibleProviderAsset(assetId),
    );

    return Promise.all(
      supportedEntries.map(([assetId, asset]) =>
        mapControllerAsset(
          accountId,
          assetId as CaipAssetType,
          accountAddress,
          asset,
        ),
      ),
    );
  }

  #splitAssetsByType(assetTypes: CaipAssetType[]) {
    const nativeAssetTypes = assetTypes.filter((assetType) =>
      assetType.endsWith(SolanaCaip19Tokens.SOL),
    ) as NativeCaipAssetType[];
    const tokenAssetTypes = assetTypes.filter((assetType) =>
      assetType.includes('/token:'),
    ) as TokenCaipAssetType[];
    const nftAssetTypes = assetTypes.filter((assetType) =>
      assetType.includes('/nft:'),
    ) as NftCaipAssetType[];

    return { nativeAssetTypes, tokenAssetTypes, nftAssetTypes };
  }

  #getNativeTokensMetadata(
    assetTypes: NativeCaipAssetType[],
  ): Record<CaipAssetType, FungibleAssetMetadata | null> {
    const nativeTokensMetadata: Record<
      CaipAssetType,
      FungibleAssetMetadata | null
    > = {};

    for (const assetType of assetTypes) {
      const {
        chain: { namespace, reference },
        assetNamespace,
        assetReference,
      } = parseCaipAssetType(assetType);

      nativeTokensMetadata[assetType] = {
        name: 'Solana',
        symbol: 'SOL',
        fungible: true,
        iconUrl: `${this.#configProvider.get().staticApi.baseUrl}/api/v2/tokenIcons/assets/${namespace}/${reference}/${assetNamespace}/${assetReference}.png`,
        units: [
          {
            name: 'Solana',
            symbol: 'SOL',
            decimals: 9,
          },
        ],
      };
    }

    return nativeTokensMetadata;
  }

  async #getNftsMetadata(
    assetTypes: NftCaipAssetType[],
  ): Promise<Record<NftCaipAssetType, NonFungibleAssetMetadata | null>> {
    const nftsMetadata = await this.#nftApiClient.getNftsMetadata(
      assetTypes.map((assetType) => {
        const { assetReference } = parseCaipAssetType(assetType);
        return assetReference;
      }),
    );

    const nftsMetadataMap: Record<NftCaipAssetType, NonFungibleAssetMetadata> =
      {};

    assetTypes.forEach((assetType, index) => {
      const nftMetadata = nftsMetadata[index];

      if (!nftMetadata) {
        return;
      }

      const metadata = {
        name: nftMetadata.name,
        symbol: nftMetadata.name,
        imageUrl: nftMetadata.imageUrl,
        description: nftMetadata.description,
        fungible: false as const,
        isPossibleSpam: false, // FIXME: The isSpam should be part of the NFT item response, not balance, otherwise we can't get it here
        attributes: Object.fromEntries(
          nftMetadata.attributes.map(
            (attr: { key: string; value: string | number }) => [
              attr.key,
              attr.value,
            ],
          ),
        ),
        collection: {
          name: nftMetadata.collectionName,
          address: nftMetadata.onchainCollectionAddress as Caip10Address,
          symbol: nftMetadata.collectionSymbol,
          tokenCount: nftMetadata.collectionCount,
          creator: '' as Caip10Address, // FIXME: There can be more than one creator
          imageUrl: nftMetadata.collectionImageUrl ?? '',
        },
      };

      nftsMetadataMap[assetType] = metadata;
    });

    return nftsMetadataMap;
  }

  async getAssetsMetadata(
    assetTypes: CaipAssetType[],
  ): Promise<Record<CaipAssetType, AssetMetadata | null>> {
    this.#logger.log('Fetching metadata for assets', assetTypes);

    const { nativeAssetTypes, tokenAssetTypes, nftAssetTypes } =
      this.#splitAssetsByType(assetTypes);

    const [
      nativeTokensMetadata,
      tokensMetadata,
      // nftMetadata,
    ] = await Promise.all([
      this.#getNativeTokensMetadata(nativeAssetTypes),
      this.#tokenApiClient.getTokensMetadata(tokenAssetTypes),
      // this.#getNftsMetadata(nftAssetTypes),
    ]);

    return {
      ...nativeTokensMetadata,
      ...tokensMetadata,
      // ...nftMetadata,
    };
  }

  async fetch(account: SolanaKeyringAccount): Promise<AssetEntity[]> {
    const assets = await this.#snapAdapter.fetch(account);
    return this.#filterTrackableAssets(assets);
  }

  async fetchAssetsMarketData(
    assets: {
      asset: CaipAssetType;
      unit: CaipAssetType;
    }[],
  ): Promise<
    Record<CaipAssetType, Record<CaipAssetType, FungibleAssetMarketData>>
  > {
    this.#logger.info('Fetching market data for assets', assets);

    const marketData =
      await this.#tokenPricesService.getMultipleTokensMarketData(assets);
    return marketData;
  }

  async save(asset: AssetEntity): Promise<void> {
    await this.saveMany([asset]);
  }

  async saveMany(assets: AssetEntity[]): Promise<void> {
    const trackableAssets = await this.#filterTrackableAssets(assets);

    if (trackableAssets.length === 0) {
      return;
    }

    await this.#snapAdapter.saveMany(trackableAssets);
  }

  /**
   * Checks if the asset has changed compared to passed assets lookup.
   *
   * @param asset - The asset to check.
   * @param assetsLookup - The lookup table to check against.
   * @returns True if the asset has changed, false otherwise.
   */
  static hasChanged(asset: AssetEntity, assetsLookup: AssetEntity[]): boolean {
    return SnapAssetsAdapter.hasChanged(asset, assetsLookup);
  }

  async getAll(): Promise<AssetEntity[]> {
    return this.#snapAdapter.getAll();
  }

  /**
   * Returns a single account asset by CAIP-19 ID, or `null` if missing.
   *
   * @param accountId - Keyring account ID.
   * @param assetId - CAIP-19 asset ID.
   */
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

    const account = await this.#accountsService.findById(accountId);
    if (!account) {
      return null;
    }

    if (stage === SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback) {
      try {
        const coreAsset = await this.#getCoreAccountAssetByID(
          accountId,
          assetId as CaipAssetType,
          account.address,
        );
        if (coreAsset) {
          return coreAsset;
        }
        return this.#snapAdapter.getAccountAssetByID(accountId, assetId);
      } catch {
        return this.#snapAdapter.getAccountAssetByID(accountId, assetId);
      }
    }

    return this.#getCoreAccountAssetByID(
      accountId,
      assetId as CaipAssetType,
      account.address,
    );
  }

  /**
   * Returns account assets for the given CAIP-19 IDs, keyed by asset ID.
   * Missing assets are `null`.
   *
   * @param accountId - Keyring account ID.
   * @param assetIds - CAIP-19 asset IDs to resolve.
   */
  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: string[],
  ): Promise<Record<string, AssetEntity | null>> {
    if (assetIds.length === 0) {
      return {};
    }

    const result: Record<string, AssetEntity | null> = {};
    const fungibleIds: string[] = [];
    const snapOwnedIds: string[] = [];

    for (const assetId of assetIds) {
      if (isSnapOwnedAsset(assetId)) {
        snapOwnedIds.push(assetId);
      } else {
        fungibleIds.push(assetId);
      }
    }

    if (snapOwnedIds.length > 0) {
      const snapResults = await this.#snapAdapter.getAccountAssetsByIDs(
        accountId,
        snapOwnedIds,
      );
      Object.assign(result, snapResults);
    }

    if (fungibleIds.length === 0) {
      return result;
    }

    const { chainId } = parseCaipAssetType(fungibleIds[0] as CaipAssetType);
    const stage = await this.#resolveMigrationStage(chainId);
    const account = await this.#accountsService.findById(accountId);

    if (!account) {
      fungibleIds.forEach((assetId) => {
        result[assetId] = null;
      });
      return result;
    }

    let fungibleResults: Record<string, AssetEntity | null>;

    if (stage === SnapsAssetsMigrationStage.Off) {
      fungibleResults = await this.#snapAdapter.getAccountAssetsByIDs(
        accountId,
        fungibleIds,
      );
    } else if (
      stage === SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback
    ) {
      try {
        fungibleResults = await this.#getCoreAccountAssetsByIDs(
          accountId,
          fungibleIds,
          account.address,
        );
      } catch {
        fungibleResults = await this.#snapAdapter.getAccountAssetsByIDs(
          accountId,
          fungibleIds,
        );
      }
    } else {
      fungibleResults = await this.#getCoreAccountAssetsByIDs(
        accountId,
        fungibleIds,
        account.address,
      );
    }

    Object.assign(result, fungibleResults);

    return result;
  }

  /**
   * Returns controller-backed assets for an account on the given Solana scope.
   *
   * @param scope - CAIP-2 chain ID to filter results.
   * @param accountId - Keyring account ID.
   */
  async getAccountAssetsByScope(
    scope: CaipChainId,
    accountId: string,
  ): Promise<AssetEntity[]> {
    const stage = await this.#resolveMigrationStage(scope);
    const snapAssets = await this.#snapAdapter.getAccountAssetsByScope(
      scope,
      accountId,
    );
    const nftAssets = snapAssets.filter((asset) =>
      isSnapOwnedAsset(asset.assetType),
    );

    if (stage === SnapsAssetsMigrationStage.Off) {
      const fungibleAssets = snapAssets.filter(
        (asset) => !isSnapOwnedAsset(asset.assetType),
      );
      return [...fungibleAssets, ...nftAssets];
    }

    const account = await this.#accountsService.findById(accountId);
    if (!account) {
      return nftAssets;
    }

    let fungibleAssets: AssetEntity[];

    if (stage === SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback) {
      try {
        fungibleAssets = await this.#getCoreAccountAssetsByScope(
          scope,
          accountId,
          account.address,
        );
      } catch {
        fungibleAssets = snapAssets.filter(
          (asset) => !isSnapOwnedAsset(asset.assetType),
        );
      }
    } else {
      fungibleAssets = await this.#getCoreAccountAssetsByScope(
        scope,
        accountId,
        account.address,
      );
    }

    return [...fungibleAssets, ...nftAssets];
  }

  /**
   * Returns assets for an account across all active Solana networks.
   *
   * @param accountId - Keyring account ID.
   */
  async getAccountAssetsForAllActiveScopes(
    accountId: string,
  ): Promise<AssetEntity[]> {
    const account = await this.#accountsService.findById(accountId);
    if (!account) {
      return [];
    }

    const chainIds = (await this.#solanaChainIds()) as CaipChainId[];
    const relevantChainIds = chainIds.filter((chainId) =>
      account.scopes.includes(chainId),
    );

    const assetsByScope = await Promise.all(
      relevantChainIds.map((scope) =>
        this.getAccountAssetsByScope(scope, accountId),
      ),
    );

    return assetsByScope.flat();
  }

  async findByAccount(account: SolanaKeyringAccount): Promise<AssetEntity[]> {
    return this.#snapAdapter.findByAccount(account);
  }
}

export { SnapsAssetsMigrationStage };
