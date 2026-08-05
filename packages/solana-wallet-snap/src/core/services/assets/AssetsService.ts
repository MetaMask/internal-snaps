/* eslint-disable jsdoc/require-returns */
import type { Caip19AssetId } from '@metamask/assets-controller';
import type { AssetsProvider } from '@metamask/snap-networks-utils';
import type {
  FungibleAssetMarketData,
  FungibleAssetMetadata,
} from '@metamask/snaps-sdk';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import type { AssetEntity } from '../../../entities';
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
import { mapControllerAsset } from './mapControllerAsset';
import type { AssetMetadata, NonFungibleAssetMetadata } from './types';

export class AssetsService {
  readonly #logger: ILogger;

  readonly #configProvider: ConfigProvider;

  readonly #assetsProvider: AssetsProvider;

  readonly #accountsService: AccountsService;

  readonly #tokenPricesService: TokenPricesService;

  readonly #tokenApiClient: TokenApiClient;

  readonly #nftApiClient: NftApiClient;

  constructor({
    logger,
    configProvider,
    accountsService,
    tokenApiClient,
    tokenPricesService,
    nftApiClient,
    assetsProvider,
  }: {
    logger: ILogger;
    configProvider: ConfigProvider;
    accountsService: AccountsService;
    tokenApiClient: TokenApiClient;
    tokenPricesService: TokenPricesService;
    nftApiClient: NftApiClient;
    assetsProvider: AssetsProvider;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🪙 AssetsService]');
    this.#configProvider = configProvider;
    this.#accountsService = accountsService;
    this.#assetsProvider = assetsProvider;
    this.#tokenApiClient = tokenApiClient;
    this.#tokenPricesService = tokenPricesService;
    this.#nftApiClient = nftApiClient;
  }

  async #solanaChainIds(): Promise<string[]> {
    return this.#configProvider.getActiveNetworks();
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
    const providerAssets = assetIds.length
      ? await this.#assetsProvider.getAccountAssetsByIDs(
          accountId,
          assetIds as Caip19AssetId[],
        )
      : {};

    const entries = await Promise.all(
      assetIds.map(async (assetId) => {
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

    return Promise.all(
      Object.entries(providerAssets).map(([assetId, asset]) =>
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
        isPossibleSpam: false,
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
          creator: '' as Caip10Address,
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

    const { nativeAssetTypes, tokenAssetTypes } =
      this.#splitAssetsByType(assetTypes);

    const [nativeTokensMetadata, tokensMetadata] = await Promise.all([
      this.#getNativeTokensMetadata(nativeAssetTypes),
      this.#tokenApiClient.getTokensMetadata(tokenAssetTypes),
    ]);

    return {
      ...nativeTokensMetadata,
      ...tokensMetadata,
    };
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

  async getAccountAssetByID(
    accountId: string,
    assetId: string,
  ): Promise<AssetEntity | null> {
    const account = await this.#accountsService.findById(accountId);
    if (!account) {
      return null;
    }

    return this.#getCoreAccountAssetByID(
      accountId,
      assetId as CaipAssetType,
      account.address,
    );
  }

  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: string[],
  ): Promise<Record<string, AssetEntity | null>> {
    if (assetIds.length === 0) {
      return {};
    }

    const account = await this.#accountsService.findById(accountId);
    if (!account) {
      return Object.fromEntries(assetIds.map((assetId) => [assetId, null]));
    }

    return this.#getCoreAccountAssetsByIDs(
      accountId,
      assetIds,
      account.address,
    );
  }

  async getAccountAssetsByScope(
    scope: CaipChainId,
    accountId: string,
  ): Promise<AssetEntity[]> {
    const account = await this.#accountsService.findById(accountId);
    if (!account) {
      return [];
    }

    return this.#getCoreAccountAssetsByScope(scope, accountId, account.address);
  }

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
        this.#getCoreAccountAssetsByScope(scope, accountId, account.address),
      ),
    );

    return assetsByScope.flat();
  }
}
