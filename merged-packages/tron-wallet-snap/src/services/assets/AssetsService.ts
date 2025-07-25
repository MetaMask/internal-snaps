import type { Balance } from '@metamask/keyring-api';
import type {
  AssetMetadata,
  FungibleAssetMetadata,
  NonFungibleAssetMetadata,
} from '@metamask/snaps-sdk';
import type { CaipAssetType } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';
import { uniq } from 'lodash';

import type { TronWebClient } from '../../clients/tronweb/TronWeb';
import type { TronKeyringAccount } from '../../entities';
import type { ILogger } from '../../utils/logger';
import type { ConfigProvider } from '../config';
import type {
  NativeCaipAssetType,
  NftCaipAssetType,
  TokenCaipAssetType,
} from './types';
import type { State, UnencryptedStateValue } from '../state/State';

export class AssetsService {
  readonly #logger: ILogger;

  readonly #loggerPrefix = '[🪙 AssetsService]';

  // readonly #configProvider: ConfigProvider;

  // readonly #state: State<UnencryptedStateValue>;

  readonly #tronWebClient: TronWebClient;

  constructor({
    logger,
    // configProvider,
    // state,
    tronWebClient,
  }: {
    logger: ILogger;
    configProvider: ConfigProvider;
    state: State<UnencryptedStateValue>;
    tronWebClient: TronWebClient;
  }) {
    this.#logger = logger;
    // this.#configProvider = configProvider;
    // this.#state = state;
    this.#tronWebClient = tronWebClient;
  }

  async #listAddressNativeAssets(
    address: string,
  ): Promise<NativeCaipAssetType[]> {
    const result = await this.#tronWebClient.getAccount(address);

    console.log('result', result.assetV2);

    return ['tron:728126428/slip44:195'];
  }

  async #listAddressTokenAssets(
    _address: string,
  ): Promise<TokenCaipAssetType[]> {
    return []; // TODO: Implement me
  }

  async #listAddressNftAssets(_address: string): Promise<NftCaipAssetType[]> {
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

    const accountAddress = account.address;

    const [nativeAssetsIds, tokenAssetsIds, nftAssetsIds] = await Promise.all([
      this.#listAddressNativeAssets(accountAddress),
      this.#listAddressTokenAssets(accountAddress),
      this.#listAddressNftAssets(accountAddress),
    ]);

    return uniq([...nativeAssetsIds, ...tokenAssetsIds, ...nftAssetsIds]);
  }

  async getAccountBalances(
    account: TronKeyringAccount,
    assetTypes: CaipAssetType[],
  ): Promise<Record<CaipAssetType, Balance>> {
    return {
      'tron:728126428/slip44:195': {
        unit: 'TRX',
        amount: '10000',
      },
    };
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

    const [nativeTokensMetadata, tokensMetadata, nftMetadata] =
      await Promise.all([
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

  #splitAssetsByType(assetTypes: CaipAssetType[]): {
    nativeAssetTypes: NativeCaipAssetType[];
    tokenAssetTypes: TokenCaipAssetType[];
    nftAssetTypes: NftCaipAssetType[];
  } {
    const nativeAssetTypes = assetTypes.filter((assetType) =>
      assetType.endsWith('slip44:195'),
    ) as NativeCaipAssetType[];
    const tokenAssetTypes = assetTypes.filter(
      (assetType) =>
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
      // const { chainId } = parseCaipAssetType(assetType);
      nativeTokensMetadata[assetType] = {
        name: 'TRON',
        symbol: 'TRX',
        fungible: true as const,
        // iconUrl: `${this.#configProvider.get().staticApi.baseUrl}/api/v2/tokenIcons/assets/tron/${chainId}/slip44/195.png`,
        iconUrl:
          'https://altcoinsbox.com/wp-content/uploads/2023/01/tron-coin-logo-300x300.webp',
        units: [
          {
            name: 'TRON',
            symbol: 'TRX',
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
    const metadata = await Promise.all(
      assetTypes.map(async (assetType) => {
        const { assetReference } = parseCaipAssetType(assetType);

        const contract = await this.#tronWebClient.tronWeb
          .contract()
          .at(assetReference);
        const name = await contract.name();
        const symbol = await contract.symbol();
        const decimals = await contract.decimals();

        return {
          [assetType]: {
            name,
            symbol,
            fungible: true as const,
            iconUrl: '',
            units: [{ decimals, symbol }],
          },
        };
      }),
    );

    return metadata.reduce((acc, curr) => {
      return { ...acc, ...curr };
    }, {});
  }

  async getNftsMetadata(
    _assetTypes: NftCaipAssetType[],
  ): Promise<Record<NftCaipAssetType, NonFungibleAssetMetadata | null>> {
    return {}; // TODO: Implement me
  }
}
