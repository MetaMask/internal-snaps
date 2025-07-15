import { AssetMetadata, FungibleAssetMetadata, NonFungibleAssetMetadata } from "@metamask/snaps-sdk";
import { CaipAssetType, parseCaipAssetType } from "@metamask/utils";
import { uniq } from "lodash";
import { TronKeyringAccount } from "../../entities";
import { ILogger } from "../../utils/logger";
import { ConfigProvider } from "../config";
import { State, UnencryptedStateValue } from "../state/State";
import { NativeCaipAssetType, NftCaipAssetType, TokenCaipAssetType } from "./types";

export class AssetsService {
  readonly #logger: ILogger;

  readonly #loggerPrefix = '[🪙 AssetsService]';

  readonly #configProvider: ConfigProvider;
  
  readonly #state: State<UnencryptedStateValue>;

  constructor({ logger, configProvider, state }: { logger: ILogger, configProvider: ConfigProvider, state: State<UnencryptedStateValue> }) {
    this.#logger = logger;
    this.#configProvider = configProvider;
    this.#state = state;
  }

  async #listAddressNativeAssets(address: string): Promise<NativeCaipAssetType[]> {
    return []; // TODO: Implement me
  }

  async #listAddressTokenAssets(
    address: string,
  ): Promise<TokenCaipAssetType[]> {
    return []; // TODO: Implement me
  }

  async #listAddressNftAssets(address: string): Promise<NftCaipAssetType[]> {
    return []; // TODO: Implement me
  }

  async listAccountAssets(
    account: TronKeyringAccount,
  ): Promise<CaipAssetType[]> {
    this.#logger.log(
      this.#loggerPrefix,
      'Fetching all assets for account',
      account,
    );

    const accountAddress = account.address

    const [
      nativeAssetsIds,
      tokenAssetsIds,
      nftAssetsIds
    ] = await Promise.all([
      this.#listAddressNativeAssets(accountAddress),
      this.#listAddressTokenAssets(accountAddress),
      this.#listAddressNftAssets(accountAddress),
    ]);

    return uniq([
      ...nativeAssetsIds,
      ...tokenAssetsIds,
      ...nftAssetsIds
    ]);
  }

  async getAssetsMetadata(
    assetTypes: CaipAssetType[],
  ): Promise<Record<CaipAssetType, AssetMetadata | null>> {
    this.#logger.log(
      this.#loggerPrefix,
      'Fetching metadata for assets',
      assetTypes,
    );

    const { nativeAssetTypes, tokenAssetTypes, nftAssetTypes } =
      this.#splitAssetsByType(assetTypes);

    const [
      nativeTokensMetadata,
      tokensMetadata,
      nftMetadata,
    ] = await Promise.all([
      this.getNativeTokensMetadata(nativeAssetTypes),
      this.getTokensMetadata(tokenAssetTypes),
      this.getNftsMetadata(nftAssetTypes),
    ]);

    return {
      ...nativeTokensMetadata,
      ...tokensMetadata,
      ...nftMetadata,
    };
  }

  #splitAssetsByType(assetTypes: CaipAssetType[]) {
    const nativeAssetTypes = assetTypes.filter((assetType) =>
      assetType.endsWith('slip44:195'),
    ) as NativeCaipAssetType[];
    const tokenAssetTypes = assetTypes.filter((assetType) =>
      assetType.includes('/trc10:') || assetType.includes('/trc20:'),
    ) as TokenCaipAssetType[];
    const nftAssetTypes = assetTypes.filter((assetType) =>
      assetType.includes('/trc721'),
    ) as NftCaipAssetType[];

    return { nativeAssetTypes, tokenAssetTypes, nftAssetTypes };
  }

  getNativeTokensMetadata(
    assetTypes: NativeCaipAssetType[],
  ): Record<CaipAssetType, FungibleAssetMetadata | null> {
    const nativeTokensMetadata: Record<
      CaipAssetType,
      FungibleAssetMetadata | null
    > = {};

    for (const assetType of assetTypes) {
      const { chainId } = parseCaipAssetType(assetType);
      nativeTokensMetadata[assetType] = {
        name: 'TRON',
        symbol: 'TRX',
        fungible: true,
        iconUrl: `${this.#configProvider.get().staticApi.baseUrl}/api/v2/tokenIcons/assets/tron/${chainId}/slip44/195.png`,
        units: [
          {
            name: 'TRON',
            symbol: 'SOL',
            decimals: 9,
          },
        ],
      };
    }

    return nativeTokensMetadata;
  }

  async getTokensMetadata(
    assetTypes: TokenCaipAssetType[],
  ): Promise<Record<TokenCaipAssetType, FungibleAssetMetadata | null>> {
    return {}; // TODO: Implement me
  }

  async getNftsMetadata(
    assetTypes: NftCaipAssetType[],
  ): Promise<Record<NftCaipAssetType, NonFungibleAssetMetadata | null>> {
    return {}; // TODO: Implement me
  }
}
