import type { FungibleAssetMetadata } from '@metamask/snaps-sdk';
import { array, assert, type Infer } from '@metamask/superstruct';
import { CaipAssetTypeStruct, parseCaipAssetType } from '@metamask/utils';

import { TokenMetadataResponseStruct } from './structs';
import { EXCLUDED_ASSET_SUFFIXES, Network } from '../../constants';
import type { TokenCaipAssetType } from '../../services/assets/types';
import { TokenCaipAssetTypeStruct } from '../../services/assets/types';
import type { ConfigProvider } from '../../services/config';
import { buildUrl } from '../../utils/buildUrl';
import type { ILogger } from '../../utils/logger';
import logger from '../../utils/logger';
import { UrlStruct } from '../../validation/structs';

const DEFAULT_DECIMALS = 9;

const DEFAULT_TOKEN_METADATA: FungibleAssetMetadata = {
  name: 'UNKNOWN',
  symbol: 'UNKNOWN',
  fungible: true,
  iconUrl: '',
  units: [{ name: 'UNKNOWN', symbol: 'UNKNOWN', decimals: DEFAULT_DECIMALS }],
} as const;

export class TokenApiClient {
  readonly #fetch: typeof globalThis.fetch;

  readonly #logger: ILogger;

  readonly #baseUrl: string;

  readonly #chunkSize: number;

  readonly #tokenIconBaseUrl: string;

  public static readonly supportedNetworks = [
    Network.Mainnet,
    Network.Nile,
    Network.Shasta,
  ];

  constructor(
    configProvider: ConfigProvider,
    _fetch: typeof globalThis.fetch = globalThis.fetch,
    _logger: ILogger = logger,
  ) {
    this.#fetch = _fetch;
    this.#logger = _logger;

    const { tokenApi, staticApi } = configProvider.get();
    const { baseUrl, chunkSize } = tokenApi;

    assert(baseUrl, UrlStruct);

    this.#baseUrl = baseUrl;
    this.#chunkSize = chunkSize;
    this.#tokenIconBaseUrl = staticApi.baseUrl;
  }

  async #fetchTokenMetadataBatch(
    assetTypes: TokenCaipAssetType[],
  ): Promise<Infer<typeof TokenMetadataResponseStruct>> {
    assert(assetTypes, array(TokenCaipAssetTypeStruct));

    const url = buildUrl({
      baseUrl: this.#baseUrl,
      path: '/v3/assets',
      queryParams: {
        assetIds: assetTypes.join(','),
      },
    });

    const response = await this.#fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    assert(data, TokenMetadataResponseStruct);

    return data;
  }

  async getTokensMetadata(
    assetTypes: TokenCaipAssetType[],
  ): Promise<Record<TokenCaipAssetType, FungibleAssetMetadata>> {
    try {
      assert(assetTypes, array(CaipAssetTypeStruct));

      /**
       * Exclude TRON resource tokens (energy and bandwidth), staked tokens, and tokens not from supported networks.
       */
      const supportedAssetTypes = assetTypes.filter((assetType) => {
        if (
          EXCLUDED_ASSET_SUFFIXES.some((suffix) => assetType.endsWith(suffix))
        ) {
          return false;
        }
        const { chainId } = parseCaipAssetType(assetType);
        return TokenApiClient.supportedNetworks.includes(chainId as Network);
      });

      if (supportedAssetTypes.length !== assetTypes.length) {
        this.#logger.warn(
          `[TokenApiClient] Received some asset types that are either not supported by the Token API or are excluded resource/staked tokens. They will be ignored. Supported networks: ${TokenApiClient.supportedNetworks.join(', ')}`,
        );
      }

      // Split addresses into chunks
      const chunks: TokenCaipAssetType[][] = [];
      for (
        let index = 0;
        index < supportedAssetTypes.length;
        index += this.#chunkSize
      ) {
        chunks.push(supportedAssetTypes.slice(index, index + this.#chunkSize));
      }

      // Fetch metadata for each chunk
      const tokenMetadataResponses = (
        await Promise.all(
          chunks.map(async (chunk) => this.#fetchTokenMetadataBatch(chunk)),
        )
      ).flat();

      // Flatten and process all metadata
      const tokenMetadataMap = new Map<
        TokenCaipAssetType,
        FungibleAssetMetadata
      >();

      /**
       * Iterate over each asset type, and return a default value when metadata is not found,
       * to ensure the returned object has exactly the same keys as the input array.
       */
      assetTypes.forEach((assetType) => {
        const tokenMetadata = tokenMetadataResponses.find(
          (item) => item.assetId === assetType,
        );

        if (!tokenMetadata) {
          this.#logger.warn(
            `No metadata for ${assetType}. Returning default values.`,
          );
          tokenMetadataMap.set(assetType, DEFAULT_TOKEN_METADATA);
          return;
        }

        const name = tokenMetadata.name ?? DEFAULT_TOKEN_METADATA.name;
        const symbol = tokenMetadata.symbol ?? DEFAULT_TOKEN_METADATA.symbol;
        const decimals = tokenMetadata.decimals ?? DEFAULT_DECIMALS;

        const metadata: FungibleAssetMetadata = {
          name,
          symbol,
          fungible: true,
          iconUrl:
            tokenMetadata.iconUrl ??
            buildUrl({
              baseUrl: this.#tokenIconBaseUrl,
              path: '/api/v2/tokenIcons/assets/{assetType}.png',
              pathParams: {
                assetType: assetType.replace(/:/gu, '/'),
              },
            }),
          units: [
            {
              name,
              symbol,
              decimals,
            },
          ],
        };

        tokenMetadataMap.set(assetType, metadata);
      });

      return Object.fromEntries(tokenMetadataMap);
    } catch (error) {
      this.#logger.error(error, 'Error fetching token metadata');
      throw error;
    }
  }
}
